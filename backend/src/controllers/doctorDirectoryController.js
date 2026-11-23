const { pool } = require('../config/database');
const appointmentService = require('../services/appointmentService');
const shiftService = require('../services/shiftService');
const { localYmd, WEEKDAY_NAMES, CLINIC_CLOSED_WEEKDAYS, weekdayOf, OPENING_HOURS } = require('../config/booking');

/**
 * Doctor directory – use case "Tìm kiếm chuyên khoa/bác sĩ" (public, no login).
 *  GET /api/doctors?q=&departmentId=   search by doctor name / specialty / expertise (accent-insensitive)
 *  GET /api/doctors/:id                profile, weekly schedule, leave days, free places for the next 7 days, reviews
 */
const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

// "Tim Mạch" == "tim mach": accent-insensitive search for Vietnamese
const fold = (text) => String(text || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
};
const DEFAULT_HOURS = OPENING_HOURS;

const listDoctors = async () => {
  const [rows] = await pool.execute(
    `SELECT d.id, u.fullname AS name, d.degree, d.room, d.bio, d.experience_years, d.expertise,
            dep.id AS department_id, dep.name AS department_name, dep.description AS department_description, dep.keywords AS department_keywords,
            (SELECT ROUND(AVG(r.rating), 1) FROM appointment_reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.doctor_id = d.id) AS avg_rating,
            (SELECT COUNT(*) FROM appointment_reviews r JOIN appointments a ON a.id = r.appointment_id WHERE a.doctor_id = d.id) AS review_count,
            (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id AND a.status = 'completed') AS patients_seen
     FROM doctors d
     JOIN users u ON u.id = d.user_id
     JOIN departments dep ON dep.id = d.department_id
     WHERE u.role = 'doctor'
     ORDER BY dep.name, u.fullname`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    degree: r.degree,
    room: r.room,
    bio: r.bio,
    experience_years: r.experience_years === null ? null : Number(r.experience_years),
    expertise: String(r.expertise || '').split(',').map((x) => x.trim()).filter(Boolean),
    department_id: r.department_id,
    department_name: r.department_name,
    department_description: r.department_description,
    department_keywords: r.department_keywords || '',
    avg_rating: r.avg_rating === null ? null : Number(r.avg_rating),
    review_count: Number(r.review_count),
    patients_seen: Number(r.patients_seen)
  }));
};

const doctorDirectoryController = {
  async search(req, res) {
    try {
      const q = fold(req.query.q);
      const departmentId = parseInt(req.query.departmentId, 10) || null;
      const all = await listDoctors();
      const doctors = all.filter((d) => {
        if (departmentId && d.department_id !== departmentId) return false;
        if (!q) return true;
        // name, specialty, expertise and the specialty's symptom keywords ("ho", "đau ngực"...)
        const hay = fold([d.name, d.degree, d.department_name, d.department_description, d.department_keywords, d.expertise.join(' '), d.bio].join(' '));
        return q.split(' ').every((word) => hay.includes(word));
      });
      // departments with their doctor count (all, not only matches, for the filter chips)
      const [departments] = await pool.execute(
        `SELECT dep.id, dep.name, dep.description, COUNT(d.id) AS doctor_count
         FROM departments dep LEFT JOIN doctors d ON d.department_id = dep.id
         GROUP BY dep.id, dep.name, dep.description ORDER BY dep.name`
      );
      res.json({
        success: true,
        data: {
          doctors,
          departments: departments.map((d) => ({ ...d, doctor_count: Number(d.doctor_count) })),
          // matching specialties for the query (e.g. "tim" -> Khoa Tim Mạch)
          matched_departments: q
            ? departments.filter((d) => fold(`${d.name} ${d.description || ''}`).includes(q)).map((d) => d.id)
            : []
        }
      });
    } catch (error) {
      console.error('Doctor search error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tìm kiếm bác sĩ');
    }
  },

  async profile(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const doctor = (await listDoctors()).find((d) => d.id === id);
      if (!doctor) return fail(res, 404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ');

      // weekly schedule: shifts if declared, else the clinic's default hours
      const [shifts] = await pool.execute(
        `SELECT weekday, TIME_FORMAT(start_time, '%H:%i') AS s, TIME_FORMAT(end_time, '%H:%i') AS e
         FROM doctor_shifts WHERE doctor_id = ? AND work_date IS NULL ORDER BY weekday, start_time`,
        [id]
      );
      const [[anyShift]] = await pool.execute('SELECT COUNT(*) AS n FROM doctor_shifts WHERE doctor_id = ?', [id]);
      const usesDefault = Number(anyShift.n) === 0;
      const weekly = [1, 2, 3, 4, 5, 6, 0].map((wd) => ({
        weekday: wd,
        label: WEEKDAY_NAMES[wd],
        closed: CLINIC_CLOSED_WEEKDAYS.includes(wd),
        hours: CLINIC_CLOSED_WEEKDAYS.includes(wd)
          ? []
          : usesDefault ? DEFAULT_HOURS : shifts.filter((s) => Number(s.weekday) === wd).map((s) => ({ start: s.s, end: s.e }))
      }));

      // next 7 days: free places per day (closed / leave / no shift explained)
      const today = localYmd();
      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const date = addDays(today, i);
        const slots = await appointmentService.getAvailableSlots(id, date);
        const block = await appointmentService.getDayBlock(id, date);
        const free = slots.filter((s) => s.available);
        const windows = await shiftService.getWindows(id, date);
        days.push({
          date,
          weekday: WEEKDAY_NAMES[weekdayOf(date)],
          hours: windows === null ? (block ? [] : DEFAULT_HOURS) : windows,
          free_slots: free.length,
          free_places: free.reduce((sum, s) => sum + (s.remaining || 0), 0),
          first_free: free[0] ? free[0].time_slot : null,
          closed_reason: block ? block.message : (free.length === 0 && slots.length > 0 ? 'Đã kín lịch hoặc đã hết giờ' : null)
        });
      }

      const [leaves] = await pool.execute(
        `SELECT DATE_FORMAT(leave_date, '%Y-%m-%d') AS date FROM doctor_leaves
         WHERE doctor_id = ? AND leave_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) ORDER BY leave_date`,
        [id]
      );
      const [reviews] = await pool.execute(
        `SELECT r.rating, r.comment, DATE_FORMAT(r.created_at, '%Y-%m-%d') AS at, u.fullname
         FROM appointment_reviews r JOIN appointments a ON a.id = r.appointment_id JOIN users u ON u.id = a.patient_id
         WHERE a.doctor_id = ? AND r.comment IS NOT NULL AND r.comment <> ''
         ORDER BY r.created_at DESC LIMIT 5`,
        [id]
      );
      // patient names are shortened ("Đ. C. Tùng") on this public page
      const mask = (name) => {
        const p = String(name || '').trim().split(/\s+/);
        return p.length > 1 ? `${p.slice(0, -1).map((w) => `${w[0]}.`).join(' ')} ${p[p.length - 1]}` : (p[0] || '');
      };

      res.json({
        success: true,
        data: {
          doctor,
          schedule: { uses_default_hours: usesDefault, weekly },
          next_days: days,
          upcoming_leaves: leaves.map((l) => l.date),
          reviews: reviews.map((r) => ({ rating: Number(r.rating), comment: r.comment, at: r.at, patient: mask(r.fullname) }))
        }
      });
    } catch (error) {
      console.error('Doctor profile error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải thông tin bác sĩ');
    }
  }
};

module.exports = doctorDirectoryController;
