const { pool } = require('../config/database');

/**
 * Visit reviews (mounted at /api/reviews)
 *
 *   POST /                 patient   {appointment_id, rating 1-5, comment?}  create or edit own review
 *   GET  /mine             patient   own reviews (by appointment)
 *   GET  /summary          doctor (own) / admin (all doctors)   averages, distribution, recent comments
 *
 * Rules: only the patient of that appointment, only after the visit is completed, and only
 * within REVIEW_WINDOW_DAYS of the visit. Patient names are shown as initials to doctors.
 */
const REVIEW_WINDOW_DAYS = 30;

const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

/** "Đỗ Chí Tùng" -> "Đ.C.T." (doctors see who, but not the full name) */
const initials = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((w) => `${w[0].toUpperCase()}.`)
  .join('');

const reviewsController = {
  async upsertReview(req, res) {
    try {
      const appointmentId = parseInt(req.body.appointment_id, 10);
      const rating = Number(req.body.rating);
      const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 500) : null;
      if (!appointmentId) return fail(res, 400, 'VALIDATION_ERROR', 'Thiếu mã lịch hẹn');
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, 'VALIDATION_ERROR', 'Số sao phải từ 1 đến 5');

      const [rows] = await pool.execute(
        `SELECT id, patient_id, doctor_id, status,
                DATEDIFF(CURDATE(), appointment_date) AS days_since
         FROM appointments WHERE id = ?`,
        [appointmentId]
      );
      if (rows.length === 0) return fail(res, 404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn');
      const a = rows[0];
      if (a.patient_id !== req.user.id) return fail(res, 403, 'FORBIDDEN', 'Bạn chỉ đánh giá được lịch khám của mình');
      if (a.status !== 'completed') return fail(res, 409, 'NOT_COMPLETED', 'Chỉ đánh giá được sau khi đã khám xong');
      if (Number(a.days_since) > REVIEW_WINDOW_DAYS) {
        return fail(res, 409, 'REVIEW_CLOSED', `Chỉ đánh giá trong vòng ${REVIEW_WINDOW_DAYS} ngày sau buổi khám`);
      }

      await pool.execute(
        `INSERT INTO appointment_reviews (appointment_id, patient_id, doctor_id, rating, comment)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
        [appointmentId, a.patient_id, a.doctor_id, rating, comment]
      );
      const [[saved]] = await pool.execute(
        'SELECT appointment_id, rating, comment, created_at, updated_at FROM appointment_reviews WHERE appointment_id = ?',
        [appointmentId]
      );
      res.json({ success: true, message: 'Cảm ơn bạn đã đánh giá!', data: saved });
    } catch (error) {
      console.error('Upsert review error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể lưu đánh giá');
    }
  },

  async myReviews(req, res) {
    try {
      const [rows] = await pool.execute(
        `SELECT appointment_id, rating, comment, created_at, updated_at
         FROM appointment_reviews WHERE patient_id = ? ORDER BY created_at DESC`,
        [req.user.id]
      );
      res.json({ success: true, data: { reviews: rows, window_days: REVIEW_WINDOW_DAYS } });
    } catch (error) {
      console.error('My reviews error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải đánh giá');
    }
  },

  async summary(req, res) {
    try {
      let doctorFilter = null;
      if (req.user.role === 'doctor') {
        const [[doc]] = await pool.execute('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
        if (!doc) return fail(res, 403, 'NOT_A_DOCTOR', 'Tài khoản chưa được gán hồ sơ bác sĩ');
        doctorFilter = doc.id;
      }

      const [doctors] = await pool.execute(
        `SELECT d.id AS doctor_id, u.fullname AS doctor_name, dep.name AS department_name,
                COUNT(r.id) AS review_count,
                ROUND(AVG(r.rating), 2) AS avg_rating,
                SUM(r.rating = 5) AS r5, SUM(r.rating = 4) AS r4, SUM(r.rating = 3) AS r3,
                SUM(r.rating = 2) AS r2, SUM(r.rating = 1) AS r1
         FROM doctors d
         JOIN users u ON u.id = d.user_id
         LEFT JOIN departments dep ON dep.id = d.department_id
         LEFT JOIN appointment_reviews r ON r.doctor_id = d.id
         WHERE u.role = 'doctor' ${doctorFilter ? 'AND d.id = ?' : ''}
         GROUP BY d.id, u.fullname, dep.name
         ORDER BY (COUNT(r.id) = 0), AVG(r.rating) DESC, COUNT(r.id) DESC, u.fullname`,
        doctorFilter ? [doctorFilter] : []
      );

      const [recent] = await pool.execute(
        `SELECT r.doctor_id, r.rating, r.comment, r.created_at,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS visit_date, p.fullname AS patient_name
         FROM appointment_reviews r
         JOIN appointments a ON a.id = r.appointment_id
         JOIN users p ON p.id = r.patient_id
         ${doctorFilter ? 'WHERE r.doctor_id = ?' : ''}
         ORDER BY r.created_at DESC
         LIMIT 50`,
        doctorFilter ? [doctorFilter] : []
      );

      res.json({
        success: true,
        data: {
          doctors: doctors.map((d) => ({
            doctor_id: d.doctor_id,
            doctor_name: d.doctor_name,
            department_name: d.department_name,
            review_count: Number(d.review_count),
            avg_rating: d.avg_rating === null ? null : Number(d.avg_rating),
            distribution: { 5: Number(d.r5 || 0), 4: Number(d.r4 || 0), 3: Number(d.r3 || 0), 2: Number(d.r2 || 0), 1: Number(d.r1 || 0) }
          })),
          recent: recent.map((r) => ({
            doctor_id: r.doctor_id,
            rating: r.rating,
            comment: r.comment,
            visit_date: r.visit_date,
            created_at: r.created_at,
            // admins see the name; doctors only initials
            patient: req.user.role === 'admin' ? r.patient_name : initials(r.patient_name)
          }))
        }
      });
    } catch (error) {
      console.error('Review summary error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải thống kê đánh giá');
    }
  }
};

module.exports = reviewsController;
module.exports.REVIEW_WINDOW_DAYS = REVIEW_WINDOW_DAYS;
module.exports.initials = initials;
