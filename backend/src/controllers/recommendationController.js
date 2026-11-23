const { pool } = require('../config/database');
const recommendationService = require('../services/recommendationService');
const auditLogService = require('../services/auditLogService');

const fail = (res, status, code, message) => res.status(status).json({ success: false, error: { code, message } });

/**
 * Whose history to analyse:
 *  - patient: always their own
 *  - receptionist / admin booking for someone: ?patientId= or ?phone=
 *  - guest: nobody (symptom rules only)
 */
const resolvePatientId = async (req) => {
  if (!req.user) return null;
  if (req.user.role === 'patient') return req.user.id;
  if (!['receptionist', 'admin'].includes(req.user.role)) return null;
  const id = parseInt(req.query.patientId, 10);
  if (id > 0) return id;
  const phone = String(req.query.phone || '').trim();
  if (/^0\d{9}$/.test(phone)) {
    const [[u]] = await pool.execute("SELECT id FROM users WHERE phone = ? AND role = 'patient' LIMIT 1", [phone]);
    return u ? u.id : null;
  }
  return null;
};

const recommendationController = {
  /** GET /api/recommendations/specialties?symptoms=  -> suggested specialties with reasons */
  async specialties(req, res) {
    try {
      const symptoms = String(req.query.symptoms || '').slice(0, 500);
      const patientId = await resolvePatientId(req);
      const data = await recommendationService.recommendSpecialties({ patientId, symptoms });
      res.json({ success: true, data });
    } catch (error) {
      // a failing recommendation must never block booking (use case 3.2.2.10 exception flow)
      console.error('Recommend specialties error:', error);
      res.json({ success: true, data: { enabled: true, specialties: [], has_history: false, error: true } });
    }
  },

  /** GET /api/recommendations/slots?doctorId=&date=  -> best free slots of that day with reasons */
  async slots(req, res) {
    try {
      const doctorId = parseInt(req.query.doctorId, 10);
      const date = String(req.query.date || '');
      if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return fail(res, 400, 'VALIDATION_ERROR', 'Thiếu bác sĩ hoặc ngày khám');
      }
      const patientId = await resolvePatientId(req);
      const data = await recommendationService.recommendSlots({ doctorId, date, patientId });
      res.json({ success: true, data });
    } catch (error) {
      console.error('Recommend slots error:', error);
      res.json({ success: true, data: { enabled: true, slots: [], error: true } });
    }
  },

  /** GET /api/recommendations/settings (admin) */
  async getSettings(req, res) {
    try {
      const { values, labels } = await recommendationService.getSettings();
      const [departments] = await pool.execute(
        `SELECT dep.id, dep.name, dep.keywords, COUNT(d.id) AS doctor_count
         FROM departments dep LEFT JOIN doctors d ON d.department_id = dep.id
         GROUP BY dep.id, dep.name, dep.keywords ORDER BY dep.name`
      );
      res.json({ success: true, data: { values, labels, departments } });
    } catch (error) {
      console.error('Get recommendation settings error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải cấu hình gợi ý');
    }
  },

  /** PUT /api/recommendations/settings (admin) { values: {...}, keywords: { [departmentId]: "a, b" } } */
  async updateSettings(req, res) {
    try {
      const changed = await recommendationService.updateSettings(req.body?.values || {}, req.user.id);
      const keywords = req.body?.keywords || {};
      let keywordCount = 0;
      for (const [id, text] of Object.entries(keywords)) {
        const depId = parseInt(id, 10);
        if (!depId) continue;
        const clean = String(text || '')
          .split(/[,;\n]/).map((k) => k.trim().replace(/\s+/g, ' ')).filter(Boolean)
          .filter((k, i, arr) => arr.indexOf(k) === i)
          .join(', ')
          .slice(0, 1000);
        await pool.execute('UPDATE departments SET keywords = ? WHERE id = ?', [clean || null, depId]);
        keywordCount += 1;
      }
      auditLogService.logActivity({
        userId: req.user.id,
        eventType: 'recommendation_settings_updated',
        eventDetails: { values: changed, keywordDepartments: Object.keys(keywords) },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }).catch(() => undefined);
      res.json({ success: true, message: `Đã lưu cấu hình gợi ý${keywordCount ? ` và từ khoá của ${keywordCount} chuyên khoa` : ''}` });
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR') return fail(res, 400, 'VALIDATION_ERROR', error.message);
      console.error('Update recommendation settings error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể lưu cấu hình gợi ý');
    }
  },

  /** GET /api/recommendations/stats?days=30 (admin) – how often bookings come from a suggestion */
  async stats(req, res) {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      res.json({ success: true, data: await recommendationService.stats(days) });
    } catch (error) {
      console.error('Recommendation stats error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể tải thống kê gợi ý');
    }
  },

  /** GET /api/recommendations/preview?phone=&symptoms= (admin) – test the rules for a patient */
  async preview(req, res) {
    try {
      const patientId = await resolvePatientId(req);
      const data = await recommendationService.recommendSpecialties({ patientId, symptoms: String(req.query.symptoms || '').slice(0, 500) });
      res.json({ success: true, data: { ...data, patient_found: Boolean(patientId) } });
    } catch (error) {
      console.error('Recommendation preview error:', error);
      fail(res, 500, 'DATABASE_ERROR', 'Không thể chạy thử gợi ý');
    }
  }
};

module.exports = recommendationController;
