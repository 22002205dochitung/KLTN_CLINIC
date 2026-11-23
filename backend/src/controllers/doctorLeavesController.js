const { pool } = require('../config/database');
const AuditLogService = require('../services/auditLogService');
const { CLINIC_CLOSED_WEEKDAYS, isClinicClosed, weekdayOf, WEEKDAY_NAMES } = require('../config/booking');

/**
 * Doctor days off (mounted at /api/doctor-leaves)
 *
 *   GET    /public?doctorId=      anyone      upcoming leave dates + clinic closing weekdays (for calendars)
 *   GET    /?doctorId=            doctor (own) / receptionist / admin   leaves with reason and affected bookings
 *   POST   /  {date, reason, doctorId?}   doctor (own) / admin
 *   DELETE /:id                   doctor (own) / admin
 *
 * Adding a day off never cancels bookings: the response lists the patients already booked that
 * day so the front desk can call them and move the appointment.
 */

const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

const todayYmd = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const doctorIdOfUser = async (userId) => {
  const [rows] = await pool.execute('SELECT id FROM doctors WHERE user_id = ?', [userId]);
  return rows.length ? rows[0].id : null;
};

/** Doctor whose leaves this request may see/change: own for doctors, any (from input) for staff */
const resolveDoctorId = async (req, requested) => {
  if (req.user.role === 'doctor') return doctorIdOfUser(req.user.id);
  const id = parseInt(requested, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const affectedBookings = async (doctorId, date) => {
  const [rows] = await pool.execute(
    `SELECT a.id, a.time_slot, a.status, u.fullname AS patient_name, u.phone AS patient_phone
     FROM appointments a
     JOIN users u ON u.id = a.patient_id
     WHERE a.doctor_id = ? AND a.appointment_date = ? AND a.status IN ('booked', 'checked_in')
     ORDER BY a.time_slot, a.id`,
    [doctorId, date]
  );
  return rows;
};

const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

const doctorLeavesController = {
  async getPublicLeaves(req, res) {
    try {
      const doctorId = parseInt(req.query.doctorId, 10);
      // No doctor chosen yet: only the clinic closing weekdays
      if (!doctorId) {
        return res.json({ success: true, data: { doctor_id: null, leave_dates: [], closed_weekdays: CLINIC_CLOSED_WEEKDAYS } });
      }
      const [rows] = await pool.execute(
        `SELECT DATE_FORMAT(leave_date, '%Y-%m-%d') AS date
         FROM doctor_leaves
         WHERE doctor_id = ? AND leave_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 180 DAY)
         ORDER BY leave_date`,
        [doctorId]
      );
      // days without a shift (only for doctors who have shifts) are off too
      const [shifts] = await pool.execute(
        `SELECT weekday, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date FROM doctor_shifts WHERE doctor_id = ?`,
        [doctorId]
      );
      const offDates = new Set(rows.map((r) => r.date));
      if (shifts.length) {
        const weekly = new Set(shifts.filter((s) => s.work_date === null).map((s) => Number(s.weekday)));
        const exact = new Set(shifts.filter((s) => s.work_date).map((s) => s.work_date));
        const day = new Date();
        for (let i = 0; i <= 120; i += 1) {
          const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
          if (!exact.has(ymd) && !weekly.has(day.getDay())) offDates.add(ymd);
          day.setDate(day.getDate() + 1);
        }
      }
      res.json({
        success: true,
        data: {
          doctor_id: doctorId,
          leave_dates: [...offDates].sort(),
          closed_weekdays: CLINIC_CLOSED_WEEKDAYS,
          has_shifts: shifts.length > 0
        }
      });
    } catch (error) {
      console.error('Get public leaves error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải lịch nghỉ');
    }
  },

  async listLeaves(req, res) {
    try {
      const doctorId = await resolveDoctorId(req, req.query.doctorId);
      if (req.user.role === 'doctor' && !doctorId) return fail(res, 403, 'NOT_A_DOCTOR', 'Tài khoản chưa được gán hồ sơ bác sĩ');

      const params = [];
      let where = 'WHERE l.leave_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      if (doctorId) {
        where += ' AND l.doctor_id = ?';
        params.push(doctorId);
      }
      const [rows] = await pool.execute(
        `SELECT l.id, l.doctor_id, DATE_FORMAT(l.leave_date, '%Y-%m-%d') AS leave_date, l.reason, l.created_at,
                du.fullname AS doctor_name, dep.name AS department_name, cu.fullname AS created_by_name,
                (SELECT COUNT(*) FROM appointments a
                  WHERE a.doctor_id = l.doctor_id AND a.appointment_date = l.leave_date
                    AND a.status IN ('booked', 'checked_in')) AS affected_count
         FROM doctor_leaves l
         JOIN doctors d ON d.id = l.doctor_id
         JOIN users du ON du.id = d.user_id
         LEFT JOIN departments dep ON dep.id = d.department_id
         LEFT JOIN users cu ON cu.id = l.created_by
         ${where}
         ORDER BY l.leave_date ASC, du.fullname ASC
         LIMIT 500`,
        params
      );

      // Patients to call, for days off that still have bookings
      for (const row of rows) {
        row.affected_count = Number(row.affected_count);
        row.affected = row.affected_count > 0 ? await affectedBookings(row.doctor_id, row.leave_date) : [];
      }
      res.json({ success: true, data: { today: todayYmd(), closed_weekdays: CLINIC_CLOSED_WEEKDAYS, leaves: rows } });
    } catch (error) {
      console.error('List leaves error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải lịch nghỉ');
    }
  },

  async createLeave(req, res) {
    try {
      const { date } = req.body;
      const reason = req.body.reason ? String(req.body.reason).trim().slice(0, 255) : null;
      const doctorId = await resolveDoctorId(req, req.body.doctorId);
      if (!doctorId) {
        return req.user.role === 'doctor'
          ? fail(res, 403, 'NOT_A_DOCTOR', 'Tài khoản chưa được gán hồ sơ bác sĩ')
          : fail(res, 400, 'VALIDATION_ERROR', 'Vui lòng chọn bác sĩ');
      }
      if (!isYmd(date)) return fail(res, 400, 'VALIDATION_ERROR', 'Ngày nghỉ không hợp lệ');
      if (date < todayYmd()) return fail(res, 400, 'PAST_DATE', 'Không thể khai báo nghỉ cho ngày đã qua');
      if ((Date.parse(date) - Date.parse(todayYmd())) / 86400000 > 365) {
        return fail(res, 400, 'TOO_FAR', 'Chỉ khai báo nghỉ trong vòng 1 năm tới');
      }
      if (isClinicClosed(date)) {
        return fail(res, 400, 'CLINIC_CLOSED', `${WEEKDAY_NAMES[weekdayOf(date)]} phòng khám đã nghỉ, không cần khai báo`);
      }

      const [doc] = await pool.execute('SELECT id FROM doctors WHERE id = ?', [doctorId]);
      if (doc.length === 0) return fail(res, 404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ');

      let insert;
      try {
        [insert] = await pool.execute(
          'INSERT INTO doctor_leaves (doctor_id, leave_date, reason, created_by) VALUES (?, ?, ?, ?)',
          [doctorId, date, reason, req.user.id]
        );
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') return fail(res, 409, 'ALREADY_ON_LEAVE', 'Ngày này đã được khai báo nghỉ');
        throw e;
      }

      const affected = await affectedBookings(doctorId, date);
      AuditLogService.logActivity({
        userId: req.user.id,
        eventType: 'doctor_leave_created',
        eventDetails: { leaveId: insert.insertId, doctorId, date, reason, affected: affected.length },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(() => undefined);

      res.status(201).json({
        success: true,
        message: affected.length
          ? `Đã lưu ngày nghỉ. Có ${affected.length} lịch hẹn trong ngày này cần liên hệ bệnh nhân để đổi lịch.`
          : 'Đã lưu ngày nghỉ',
        data: { id: insert.insertId, doctor_id: doctorId, leave_date: date, reason, affected }
      });
    } catch (error) {
      console.error('Create leave error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể lưu ngày nghỉ');
    }
  },

  async deleteLeave(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'Mã ngày nghỉ không hợp lệ');
      const [rows] = await pool.execute(
        "SELECT id, doctor_id, DATE_FORMAT(leave_date, '%Y-%m-%d') AS leave_date FROM doctor_leaves WHERE id = ?",
        [id]
      );
      if (rows.length === 0) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy ngày nghỉ');
      if (req.user.role === 'doctor') {
        const own = await doctorIdOfUser(req.user.id);
        if (own !== rows[0].doctor_id) return fail(res, 403, 'FORBIDDEN', 'Bạn chỉ xoá được ngày nghỉ của mình');
      }
      await pool.execute('DELETE FROM doctor_leaves WHERE id = ?', [id]);
      AuditLogService.logActivity({
        userId: req.user.id,
        eventType: 'doctor_leave_deleted',
        eventDetails: { leaveId: id, doctorId: rows[0].doctor_id, date: rows[0].leave_date },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(() => undefined);
      res.json({ success: true, message: 'Đã xoá ngày nghỉ' });
    } catch (error) {
      console.error('Delete leave error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể xoá ngày nghỉ');
    }
  }
};

module.exports = doctorLeavesController;
