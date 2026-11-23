const { pool } = require('../config/database');
const shiftService = require('../services/shiftService');
const auditLogService = require('../services/auditLogService');
const { isClinicClosed, CLINIC_CLOSED_WEEKDAYS, WEEKDAY_NAMES, localYmd, weekdayOf } = require('../config/booking');

/**
 * Doctor shifts (ca trực) – use case "Quản lý ca trực".
 *  GET    /api/doctor-shifts?doctorId=     admin, receptionist, doctor (own)
 *  POST   /api/doctor-shifts               admin   { doctorId, weekday | workDate, startTime, endTime, note }
 *  POST   /api/doctor-shifts/template      admin   { doctorId } – default week (Mon–Sat, 08–12 & 14–17)
 *  DELETE /api/doctor-shifts/:id           admin   refused when patients already booked inside the shift
 */
const fail = (res, status, code, message, extra = {}) => res.status(status).json({ success: false, error: { code, message, ...extra } });
const TIME = /^([01]\d|2[0-3]):(00|30)$/;
const OPEN = '06:00';
const CLOSE = '21:00';
const pad = (n) => String(n).padStart(2, '0');
const dmy = (ymd) => String(ymd).split('-').reverse().join('/');

const audit = (req, eventType, eventDetails) => auditLogService.logActivity({
  userId: req.user.id, eventType, eventDetails, ipAddress: req.ip, userAgent: req.get('user-agent')
}).catch(() => undefined);

const resolveDoctor = async (req, requested) => {
  if (req.user.role === 'doctor') {
    const [[d]] = await pool.execute('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
    return d ? d.id : null;
  }
  const id = parseInt(requested, 10);
  return id > 0 ? id : null;
};

/**
 * Upcoming bookings of a doctor that would no longer be inside a shift.
 * `windowsFor(date)` returns the shift windows to test against for that date.
 */
const bookingsOutside = async (conn, doctorId, windowsFor) => {
  const [rows] = await conn.execute(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.time_slot, u.fullname AS patient_name, u.phone
     FROM appointments a JOIN users u ON u.id = a.patient_id
     WHERE a.doctor_id = ? AND a.status = 'booked' AND a.appointment_date >= CURDATE()
     ORDER BY a.appointment_date, a.time_slot`,
    [doctorId]
  );
  const out = [];
  for (const r of rows) {
    const windows = await windowsFor(r.d);
    if (!shiftService.slotInWindows(r.time_slot, windows)) out.push(r);
  }
  return out;
};

const doctorShiftsController = {
  async list(req, res) {
    try {
      const doctorId = await resolveDoctor(req, req.query.doctorId);
      if (!doctorId) return fail(res, 400, 'VALIDATION_ERROR', 'Chọn bác sĩ');
      const [[doctor]] = await pool.execute(
        `SELECT d.id, u.fullname AS name, dep.name AS department, d.room
         FROM doctors d JOIN users u ON u.id = d.user_id LEFT JOIN departments dep ON dep.id = d.department_id
         WHERE d.id = ?`,
        [doctorId]
      );
      if (!doctor) return fail(res, 404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ');
      const [rows] = await pool.execute(
        `SELECT id, weekday, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                TIME_FORMAT(start_time, '%H:%i') AS start_time, TIME_FORMAT(end_time, '%H:%i') AS end_time, note
         FROM doctor_shifts
         WHERE doctor_id = ? AND (work_date IS NULL OR work_date >= CURDATE())
         ORDER BY work_date IS NOT NULL, weekday, work_date, start_time`,
        [doctorId]
      );
      // booked patients per shift, so the admin sees which shifts are in use
      const [booked] = await pool.execute(
        `SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS d, time_slot FROM appointments
         WHERE doctor_id = ? AND status = 'booked' AND appointment_date >= CURDATE()`,
        [doctorId]
      );
      const exactDates = new Set(rows.filter((r) => r.work_date).map((r) => r.work_date));
      const shifts = rows.map((r) => {
        const inside = booked.filter((b) => {
          const sameDay = r.work_date ? b.d === r.work_date : (!exactDates.has(b.d) && weekdayOf(b.d) === Number(r.weekday));
          return sameDay && shiftService.slotInWindows(b.time_slot, [{ start: r.start_time, end: r.end_time }]);
        }).length;
        return { ...r, weekday: r.weekday === null ? null : Number(r.weekday), booked: inside };
      });
      res.json({
        success: true,
        data: {
          doctor,
          uses_default_hours: shifts.length === 0 && !(await pool.execute('SELECT 1 FROM doctor_shifts WHERE doctor_id = ? LIMIT 1', [doctorId]))[0].length,
          closed_weekdays: CLINIC_CLOSED_WEEKDAYS,
          weekly: shifts.filter((s) => s.work_date === null),
          dates: shifts.filter((s) => s.work_date !== null)
        }
      });
    } catch (error) {
      console.error('List shifts error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải ca trực');
    }
  },

  async create(req, res) {
    const { doctorId, weekday, workDate, startTime, endTime } = req.body || {};
    const note = String(req.body?.note || '').trim().slice(0, 255) || null;
    const docId = parseInt(doctorId, 10);
    if (!docId) return fail(res, 400, 'VALIDATION_ERROR', 'Chọn bác sĩ');
    if (!TIME.test(startTime || '') || !TIME.test(endTime || '')) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Giờ bắt đầu/kết thúc phải theo bước 30 phút (VD 08:00, 13:30)');
    }
    if (startTime >= endTime) return fail(res, 400, 'VALIDATION_ERROR', 'Giờ kết thúc phải sau giờ bắt đầu');
    if (startTime < OPEN || endTime > CLOSE) return fail(res, 400, 'VALIDATION_ERROR', `Ca trực phải nằm trong ${OPEN}–${CLOSE}`);
    const isWeekly = workDate === undefined || workDate === null || workDate === '';
    let wd = null;
    if (isWeekly) {
      wd = Number(weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) return fail(res, 400, 'VALIDATION_ERROR', 'Chọn thứ trong tuần');
      if (CLINIC_CLOSED_WEEKDAYS.includes(wd)) return fail(res, 400, 'CLINIC_CLOSED', `Phòng khám nghỉ ${WEEKDAY_NAMES[wd]}`);
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return fail(res, 400, 'VALIDATION_ERROR', 'Ngày không hợp lệ');
      if (workDate < localYmd()) return fail(res, 400, 'VALIDATION_ERROR', 'Không thể thêm ca cho ngày đã qua');
      if (isClinicClosed(workDate)) return fail(res, 400, 'CLINIC_CLOSED', `Phòng khám nghỉ ${WEEKDAY_NAMES[weekdayOf(workDate)]}`);
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[doc]] = await conn.execute('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [docId]);
      if (!doc) { await conn.rollback(); return fail(res, 404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ'); }
      // overlap with another shift of the same doctor on the same weekday / date
      const [overlap] = await conn.execute(
        `SELECT TIME_FORMAT(start_time, '%H:%i') AS s, TIME_FORMAT(end_time, '%H:%i') AS e FROM doctor_shifts
         WHERE doctor_id = ? AND ${isWeekly ? 'weekday = ? AND work_date IS NULL' : 'work_date = ?'}
           AND start_time < ? AND end_time > ?`,
        [docId, isWeekly ? wd : workDate, `${endTime}:00`, `${startTime}:00`]
      );
      if (overlap.length) {
        await conn.rollback();
        return fail(res, 409, 'SHIFT_OVERLAP', `Trùng với ca ${overlap[0].s}–${overlap[0].e} đã có`);
      }
      const [hadShifts] = await conn.execute('SELECT 1 FROM doctor_shifts WHERE doctor_id = ? LIMIT 1', [docId]);
      const [result] = await conn.execute(
        `INSERT INTO doctor_shifts (doctor_id, weekday, work_date, start_time, end_time, note, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [docId, isWeekly ? wd : null, isWeekly ? null : workDate, `${startTime}:00`, `${endTime}:00`, note, req.user.id]
      );
      // bookings that now fall outside the doctor's shifts (e.g. first shift ever replaces default hours)
      const affected = await bookingsOutside(conn, docId, (d) => shiftService.getWindows(docId, d, conn));
      await conn.commit();
      audit(req, 'doctor_shift_created', { shiftId: result.insertId, doctorId: docId, weekday: wd, workDate: workDate || null, startTime, endTime });
      const when = isWeekly ? `mỗi ${WEEKDAY_NAMES[wd]}` : `ngày ${dmy(workDate)}`;
      res.status(201).json({
        success: true,
        message: `Đã thêm ca ${startTime}–${endTime} ${when}${!hadShifts.length ? ' – từ nay bác sĩ chỉ nhận lịch trong các ca đã khai báo' : ''}`,
        data: { id: result.insertId, affected }
      });
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      console.error('Create shift error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể thêm ca trực');
    } finally {
      conn.release();
    }
  },

  /** Default week for a doctor: Mon–Sat (clinic open days) 08:00–12:00 and 14:00–17:00 */
  async applyTemplate(req, res) {
    const docId = parseInt(req.body?.doctorId, 10);
    if (!docId) return fail(res, 400, 'VALIDATION_ERROR', 'Chọn bác sĩ');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[doc]] = await conn.execute('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [docId]);
      if (!doc) { await conn.rollback(); return fail(res, 404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ'); }
      const [existing] = await conn.execute('SELECT 1 FROM doctor_shifts WHERE doctor_id = ? AND work_date IS NULL LIMIT 1', [docId]);
      if (existing.length) {
        await conn.rollback();
        return fail(res, 409, 'HAS_SHIFTS', 'Bác sĩ đã có lịch ca hằng tuần – hãy sửa từng ca');
      }
      let added = 0;
      for (let wd = 0; wd <= 6; wd += 1) {
        if (CLINIC_CLOSED_WEEKDAYS.includes(wd)) continue;
        for (const [s, e] of [['08:00:00', '12:00:00'], ['14:00:00', '17:00:00']]) {
          await conn.execute(
            'INSERT INTO doctor_shifts (doctor_id, weekday, start_time, end_time, note, created_by) VALUES (?, ?, ?, ?, ?, ?)',
            [docId, wd, s, e, 'Lịch mặc định', req.user.id]
          );
          added += 1;
        }
      }
      await conn.commit();
      audit(req, 'doctor_shift_template', { doctorId: docId, added });
      res.status(201).json({ success: true, message: `Đã tạo ${added} ca hằng tuần (sáng 08:00–12:00, chiều 14:00–17:00)` });
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      console.error('Shift template error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tạo lịch mặc định');
    } finally {
      conn.release();
    }
  },

  async remove(req, res) {
    const id = parseInt(req.params.id, 10);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã ca không hợp lệ');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [[shift]] = await conn.execute(
        `SELECT id, doctor_id, weekday, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
                TIME_FORMAT(start_time, '%H:%i') AS start_time, TIME_FORMAT(end_time, '%H:%i') AS end_time
         FROM doctor_shifts WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (!shift) { await conn.rollback(); return fail(res, 404, 'SHIFT_NOT_FOUND', 'Không tìm thấy ca trực'); }
      // bookings already outside the shifts before (not caused by this deletion)
      const before = new Set((await bookingsOutside(conn, shift.doctor_id, (d) => shiftService.getWindows(shift.doctor_id, d, conn))).map((b) => b.id));
      await conn.execute('DELETE FROM doctor_shifts WHERE id = ?', [id]);
      // who would lose their slot because of this deletion?
      const [left] = await conn.execute('SELECT 1 FROM doctor_shifts WHERE doctor_id = ? LIMIT 1', [shift.doctor_id]);
      const affected = left.length
        ? (await bookingsOutside(conn, shift.doctor_id, (d) => shiftService.getWindows(shift.doctor_id, d, conn))).filter((b) => !before.has(b.id))
        : [];
      if (affected.length) {
        await conn.rollback();
        return fail(res, 409, 'SHIFT_HAS_BOOKINGS',
          `Ca này đã có ${affected.length} lịch hẹn – không thể xoá. Hãy gọi báo bệnh nhân đổi lịch trước (hoặc dùng "Lịch nghỉ bác sĩ" để báo nghỉ).`,
          { affected: affected.slice(0, 20).map((a) => ({ ...a, date: dmy(a.d) })) });
      }
      await conn.commit();
      audit(req, 'doctor_shift_deleted', { shiftId: id, doctorId: shift.doctor_id });
      const when = shift.work_date ? `ngày ${dmy(shift.work_date)}` : `mỗi ${WEEKDAY_NAMES[shift.weekday]}`;
      res.json({
        success: true,
        message: `Đã xoá ca ${shift.start_time}–${shift.end_time} ${when}${left.length ? '' : ' – bác sĩ quay về giờ làm mặc định của phòng khám'}`
      });
    } catch (error) {
      await conn.rollback().catch(() => undefined);
      console.error('Delete shift error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể xoá ca trực');
    } finally {
      conn.release();
    }
  }
};

module.exports = doctorShiftsController;
module.exports.pad = pad;
