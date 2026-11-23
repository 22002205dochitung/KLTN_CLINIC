const { pool } = require('../config/database');
const appointmentService = require('./appointmentService');
const { isClinicClosed, localYmd } = require('../config/booking');

/**
 * Smart appointment recommendation (gợi ý lịch khám thông minh).
 *
 * Hybrid, explainable approach – no machine-learning model:
 *  Rule-based
 *   R1 follow-up      the doctor set a re-examination date that has not been booked yet
 *   R2 frequency      the patient keeps coming to this specialty (visits in the last N months)
 *   R3 recency        the last visit to this specialty was recent
 *   R4 chronic        a chronic condition in the health profile belongs to this specialty
 *   R5 profile        age / gender rules (children -> Paediatrics; Obstetrics only for women)
 *  Content-based
 *   C1 symptom match  words of the symptoms typed now vs. each specialty's keyword list
 *   C2 similar visit  symptoms typed now vs. symptoms/diagnosis of the patient's past visits
 *                     (token overlap, Jaccard similarity)
 * Every point added carries a human-readable reason, so each suggestion can be explained.
 * Weights and thresholds live in `recommendation_settings` and are edited by the admin.
 */

const DEFAULTS = {
  enabled: 1,
  history_months: 12,
  w_followup: 100,
  w_frequency: 25,
  w_recency: 20,
  recency_days: 90,
  w_symptom: 30,
  w_chronic: 35,
  w_profile: 25,
  child_age: 16,
  min_score: 20,
  max_suggestions: 3,
  slot_suggestions: 3
};

const SETTING_LIMITS = {
  enabled: [0, 1],
  history_months: [1, 60],
  w_followup: [0, 500],
  w_frequency: [0, 200],
  w_recency: [0, 200],
  recency_days: [1, 730],
  w_symptom: [0, 200],
  w_chronic: [0, 200],
  w_profile: [0, 200],
  child_age: [1, 18],
  min_score: [0, 500],
  max_suggestions: [1, 8],
  slot_suggestions: [1, 8]
};

// Vietnamese text -> lower case without accents, so "Đau Họng" matches "dau hong"
const fold = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9\s,;.]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// With accents: "mờ" and "mổ" are different words; only text typed without accents is
// compared accent-insensitively (otherwise "mờ mắt" would match the keyword "mổ").
const hasAccents = (text) => /[^\x00-\x7f]/.test(String(text || ''));
const plain = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFC')
  .replace(/[^\p{L}\p{N}\s,;.]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const norm = (text, accentless) => (accentless ? fold(text) : plain(text));

const STOP_WORDS = new Set(['bi', 'va', 'co', 'la', 'cua', 'nhieu', 'ngay', 'hay', 'thay', 'toi', 'em', 'anh', 'chi', 'hoi', 'rat', 'kem', 'theo', 'sau', 'khi', 'nhe', 'lan', 'mot', 'hai', 'ba', 'tuan', 'thang', 'gan', 'day', 'bi', 'dang', 'da', 'nen', 'can', 'kham', 'benh']);
const tokens = (text, accentless = true) => new Set(norm(text, accentless).split(/[\s,;.]+/)
  .filter((w) => w.length > 1 && !STOP_WORDS.has(fold(w))));
const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((w) => { if (b.has(w)) inter += 1; });
  return inter / (a.size + b.size - inter);
};

const pad = (n) => String(n).padStart(2, '0');
const dmy = (ymd) => (ymd ? String(ymd).slice(0, 10).split('-').reverse().join('/') : '');
const toYmd = (v) => {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : localYmd(d);
};
const daysBetween = (fromYmd, toYmdStr) => Math.round((new Date(`${toYmdStr}T00:00:00`) - new Date(`${fromYmd}T00:00:00`)) / 86400000);
const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localYmd(d);
};
const ageOf = (dob) => {
  const ymd = toYmd(dob);
  if (!ymd) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
};
const isPaediatrics = (name) => /nhi/i.test(fold(name));
const isObstetrics = (name) => /\bsan\b|phu khoa/.test(fold(name));
const periodOf = (slot) => (parseInt(String(slot).slice(0, 2), 10) < 12 ? 'morning' : 'afternoon');
const PERIOD_LABEL = { morning: 'buổi sáng', afternoon: 'buổi chiều' };

class RecommendationService {
  async getSettings() {
    const [rows] = await pool.execute('SELECT setting_key, setting_value, label FROM recommendation_settings');
    const values = { ...DEFAULTS };
    const labels = {};
    rows.forEach((r) => {
      if (r.setting_key in DEFAULTS) values[r.setting_key] = Number(r.setting_value);
      labels[r.setting_key] = r.label;
    });
    return { values, labels };
  }

  async updateSettings(changes, userId) {
    const clean = {};
    for (const [key, raw] of Object.entries(changes || {})) {
      if (!(key in SETTING_LIMITS)) continue;
      const n = Number(raw);
      const [min, max] = SETTING_LIMITS[key];
      if (!Number.isFinite(n) || n < min || n > max || !Number.isInteger(n)) {
        const err = new Error(`Giá trị "${key}" phải là số nguyên từ ${min} đến ${max}`);
        err.code = 'VALIDATION_ERROR';
        throw err;
      }
      clean[key] = n;
    }
    for (const [key, value] of Object.entries(clean)) {
      await pool.execute(
        `INSERT INTO recommendation_settings (setting_key, setting_value, label, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [key, String(value), key, userId]
      );
    }
    return clean;
  }

  /** Departments that have at least one doctor (only those can be booked) */
  async loadDepartments() {
    const [rows] = await pool.execute(
      `SELECT dep.id, dep.name, dep.keywords, COUNT(d.id) AS doctor_count
       FROM departments dep
       LEFT JOIN doctors d ON d.department_id = dep.id
       GROUP BY dep.id, dep.name, dep.keywords`
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      doctorCount: Number(r.doctor_count),
      keywords: String(r.keywords || '').split(/[,;\n]/).map((k) => k.trim()).filter(Boolean)
    }));
  }

  async loadPatient(patientId, months) {
    const [[profile]] = await pool.execute(
      `SELECT id, fullname, date_of_birth, gender, chronic_conditions, allergies FROM users WHERE id = ?`,
      [patientId]
    );
    if (!profile) return null;
    // finished visits (examined) in the analysis window, newest first
    const [visits] = await pool.execute(
      `SELECT a.id AS appointment_id, a.doctor_id, a.time_slot,
              DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS visit_date,
              d.department_id, du.fullname AS doctor_name,
              mr.id AS record_id, mr.symptoms, mr.diagnosis,
              DATE_FORMAT(mr.reexamination_date, '%Y-%m-%d') AS reexamination_date,
              mr.created_at AS record_created_at
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN users du ON du.id = d.user_id
       LEFT JOIN medical_records mr ON mr.appointment_id = a.id
       WHERE a.patient_id = ? AND a.status = 'completed'
         AND a.appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       ORDER BY a.appointment_date DESC, a.id DESC`,
      [patientId, months]
    );
    // bookings already made (to know whether a follow-up is already booked)
    const [upcoming] = await pool.execute(
      `SELECT a.id, d.department_id, a.doctor_id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d, a.created_at
       FROM appointments a JOIN doctors d ON d.id = a.doctor_id
       WHERE a.patient_id = ? AND a.status IN ('booked', 'checked_in') AND a.appointment_date >= CURDATE()`,
      [patientId]
    );
    return { profile, visits, upcoming };
  }

  /**
   * Specialty suggestions for the booking form.
   * @param {number|null} patientId  signed-in patient (null = guest: symptom rules only)
   * @param {string} symptoms        what the patient typed (optional)
   */
  async recommendSpecialties({ patientId = null, symptoms = '' } = {}) {
    const { values: S } = await this.getSettings();
    if (!S.enabled) return { enabled: false, specialties: [], has_history: false };

    const departments = await this.loadDepartments();
    const scores = new Map(departments.map((d) => [d.id, { dept: d, score: 0, reasons: [], doctor: null, date: null, source: null }]));
    const add = (deptId, points, type, text, extra = {}) => {
      const s = scores.get(deptId);
      if (!s || points <= 0) return;
      s.score += points;
      s.reasons.push({ type, text, points: Math.round(points) });
      Object.assign(s, extra);
    };

    const today = localYmd();
    let data = null;
    if (patientId) data = await this.loadPatient(patientId, S.history_months);
    const visits = data ? data.visits : [];
    const profile = data ? data.profile : null;

    // ---- R1 follow-up not booked yet (newest record per specialty) ----
    const seenFollowUp = new Set();
    visits.filter((v) => v.reexamination_date).forEach((v) => {
      if (seenFollowUp.has(v.department_id)) return;
      seenFollowUp.add(v.department_id);
      const booked = data.upcoming.some((u) => u.department_id === v.department_id && u.d >= v.visit_date && new Date(u.created_at) >= new Date(v.record_created_at || 0));
      const overdue = daysBetween(v.reexamination_date, today); // > 0 = overdue by n days
      if (booked || overdue > 60) return;
      const when = overdue > 0 ? `đã quá hạn ${overdue} ngày` : overdue === 0 ? 'là hôm nay' : `còn ${-overdue} ngày`;
      add(v.department_id, S.w_followup, 'followup',
        `${v.doctor_name} hẹn tái khám ngày ${dmy(v.reexamination_date)} (${when})`,
        { doctor: { id: v.doctor_id, name: v.doctor_name, reason: 'Bác sĩ đã hẹn tái khám' }, date: v.reexamination_date < today ? today : v.reexamination_date, source: 'followup' });
    });

    // ---- R2 frequency + R3 recency ----
    const byDept = new Map();
    visits.forEach((v) => {
      if (!byDept.has(v.department_id)) byDept.set(v.department_id, []);
      byDept.get(v.department_id).push(v);
    });
    byDept.forEach((list, deptId) => {
      if (list.length >= 2) {
        add(deptId, S.w_frequency * Math.min(list.length, 4), 'frequency',
          `Bạn đã khám ${list.length} lần tại khoa này trong ${S.history_months} tháng qua`);
      }
      const last = list[0];
      const ago = daysBetween(last.visit_date, today);
      if (ago <= S.recency_days) {
        add(deptId, S.w_recency, 'recency',
          `Lần khám gần nhất ${dmy(last.visit_date)} (${ago} ngày trước)${last.diagnosis ? ` – chẩn đoán: ${last.diagnosis}` : ''}`);
      }
    });

    // ---- C1 symptoms vs specialty keywords ----
    const accentless = !hasAccents(symptoms);
    const typed = norm(symptoms, accentless);
    const typedTokens = tokens(symptoms, accentless);
    if (typed) {
      departments.forEach((d) => {
        const hits = d.keywords.filter((k) => {
          const fk = norm(k, accentless);
          return fk && new RegExp(`(^|[\\s,;.])${fk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,;.])`).test(` ${typed} `);
        });
        if (hits.length) {
          add(d.id, S.w_symptom * Math.min(hits.length, 3), 'symptom',
            `Triệu chứng “${hits.slice(0, 3).join(', ')}” thường được khám tại ${d.name}`);
        }
      });
    }

    // ---- C2 symptoms vs the patient's past visits ----
    if (typedTokens.size && visits.length) {
      const best = new Map();
      visits.forEach((v) => {
        const sim = jaccard(typedTokens, tokens(`${v.symptoms || ''} ${v.diagnosis || ''}`, accentless));
        if (sim >= 0.15 && (!best.has(v.department_id) || sim > best.get(v.department_id).sim)) {
          best.set(v.department_id, { sim, v });
        }
      });
      best.forEach(({ sim, v }, deptId) => {
        add(deptId, Math.round(S.w_symptom * (0.5 + sim)), 'similar',
          `Giống lần khám ngày ${dmy(v.visit_date)} (${Math.round(sim * 100)}% tương đồng${v.diagnosis ? `, chẩn đoán: ${v.diagnosis}` : ''})`,
          scores.get(deptId).doctor ? {} : { doctor: { id: v.doctor_id, name: v.doctor_name, reason: 'Bác sĩ đã khám lần trước với triệu chứng tương tự' } });
      });
    }

    // ---- R4 chronic conditions ----
    if (profile && profile.chronic_conditions) {
      const chronic = fold(profile.chronic_conditions);
      departments.forEach((d) => {
        const hit = d.keywords.find((k) => fold(k).length > 2 && chronic.includes(fold(k)));
        if (hit) add(d.id, S.w_chronic, 'chronic', `Bệnh nền “${profile.chronic_conditions}” nên theo dõi định kỳ tại ${d.name}`);
      });
    }

    // ---- R5 age / gender ----
    const age = profile ? ageOf(profile.date_of_birth) : null;
    departments.forEach((d) => {
      const s = scores.get(d.id);
      if (isPaediatrics(d.name) && age !== null) {
        if (age < S.child_age) {
          if (s.score > 0 || !typed) add(d.id, S.w_profile, 'profile', `Bệnh nhân ${age} tuổi – trẻ dưới ${S.child_age} tuổi khám tại ${d.name}`);
        } else {
          s.excluded = 'Khoa Nhi chỉ khám cho trẻ em';
        }
      }
      if (isObstetrics(d.name) && profile && profile.gender === 'male') s.excluded = 'Sản - Phụ khoa chỉ dành cho nữ';
    });

    // ---- rank ----
    const ranked = [...scores.values()]
      .filter((s) => !s.excluded && s.dept.doctorCount > 0 && s.score >= S.min_score)
      .sort((a, b) => b.score - a.score)
      .slice(0, S.max_suggestions);

    // matching specialties nobody can be booked with yet (no doctor) – shown as a note, not hidden
    const unavailable = [...scores.values()]
      .filter((s) => !s.excluded && s.dept.doctorCount === 0 && s.score >= S.min_score)
      .sort((a, b) => b.score - a.score)
      .map((s) => ({ department_id: s.dept.id, department_name: s.dept.name, score: Math.round(s.score), reasons: s.reasons }));

    // doctor + nearest free slot for each suggestion
    const specialties = [];
    for (const s of ranked) {
      const doctor = s.doctor || await this.pickDoctor(s.dept.id, patientId, visits);
      const next = doctor ? await this.nextFreeSlot(doctor.id, s.date || today, patientId) : null;
      specialties.push({
        department_id: s.dept.id,
        department_name: s.dept.name,
        score: Math.round(s.score),
        source: s.source || 'specialty',
        reasons: s.reasons.sort((a, b) => b.points - a.points),
        doctor,
        next_slot: next
      });
    }

    return {
      enabled: true,
      has_history: visits.length > 0,
      analysed: {
        visits: visits.length,
        months: S.history_months,
        symptoms: typed ? [...typedTokens].slice(0, 10) : [],
        age,
        gender: profile ? profile.gender : null
      },
      specialties,
      unavailable
    };
  }

  /** Continuity of care first, then rating, then the least busy doctor next week */
  async pickDoctor(departmentId, patientId, visits) {
    const mine = visits.filter((v) => v.department_id === departmentId);
    if (mine.length) {
      const count = new Map();
      mine.forEach((v) => count.set(v.doctor_id, { n: (count.get(v.doctor_id)?.n || 0) + 1, name: v.doctor_name }));
      const [id, info] = [...count.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      return { id, name: info.name, reason: `Đã khám cho bạn ${info.n} lần – theo dõi liên tục` };
    }
    const [rows] = await pool.execute(
      `SELECT d.id, u.fullname AS name,
              (SELECT AVG(r.rating) FROM appointment_reviews r JOIN appointments a2 ON a2.id = r.appointment_id WHERE a2.doctor_id = d.id) AS rating,
              (SELECT COUNT(*) FROM appointment_reviews r JOIN appointments a2 ON a2.id = r.appointment_id WHERE a2.doctor_id = d.id) AS reviews,
              (SELECT COUNT(*) FROM appointments a3 WHERE a3.doctor_id = d.id AND a3.status = 'booked'
                 AND a3.appointment_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)) AS load_next_week
       FROM doctors d JOIN users u ON u.id = d.user_id
       WHERE d.department_id = ?`,
      [departmentId]
    );
    if (!rows.length) return null;
    rows.sort((a, b) => (Number(b.rating || 0) - Number(a.rating || 0)) || (Number(a.load_next_week) - Number(b.load_next_week)));
    const best = rows[0];
    const reason = Number(best.reviews) > 0
      ? `Đánh giá ${Number(best.rating).toFixed(1)}★ từ ${best.reviews} bệnh nhân`
      : `Lịch tuần tới còn nhiều chỗ (${best.load_next_week} lịch đã đặt)`;
    return { id: best.id, name: best.name, reason };
  }

  /** Nearest day (within 14 days, from `fromYmd`) with a recommended free slot */
  async nextFreeSlot(doctorId, fromYmd, patientId) {
    let day = fromYmd < localYmd() ? localYmd() : fromYmd;
    for (let i = 0; i < 14; i += 1, day = addDays(day, 1)) {
      if (isClinicClosed(day)) continue;
      const slots = await this.recommendSlots({ doctorId, date: day, patientId, limit: 1 });
      if (slots.slots.length) return { date: day, time_slot: slots.slots[0].time_slot, reasons: slots.slots[0].reasons };
    }
    return null;
  }

  /**
   * Rank the free slots of a doctor on a day:
   *  + the part of day the patient usually comes (from history)
   *  + fewer people already booked (shorter wait)
   *  + earliest free slot
   */
  async recommendSlots({ doctorId, date, patientId = null, limit = null }) {
    const { values: S } = await this.getSettings();
    if (!S.enabled) return { enabled: false, slots: [] };
    const all = await appointmentService.getAvailableSlots(doctorId, date);
    const free = all.filter((s) => s.available);
    if (!free.length) return { enabled: true, slots: [], preferred_period: null };

    let preferred = null;
    let preferredCount = 0;
    if (patientId) {
      const [rows] = await pool.execute(
        `SELECT time_slot FROM appointments WHERE patient_id = ? AND status IN ('completed', 'checked_in', 'booked')
         AND appointment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)`,
        [patientId, S.history_months]
      );
      const counts = { morning: 0, afternoon: 0 };
      rows.forEach((r) => { counts[periodOf(r.time_slot)] += 1; });
      const total = counts.morning + counts.afternoon;
      if (total >= 2) {
        preferred = counts.morning >= counts.afternoon ? 'morning' : 'afternoon';
        preferredCount = counts[preferred];
        if (preferredCount / total < 0.6) preferred = null; // no clear habit
      }
    }

    const scored = free.map((s, index) => {
      const reasons = [];
      let score = 0;
      if (preferred && periodOf(s.time_slot) === preferred) {
        score += 3;
        reasons.push(`Đúng ${PERIOD_LABEL[preferred]} bạn hay đi khám (${preferredCount} lần)`);
      }
      const capacity = s.capacity || 10;
      score += 2 * (1 - (s.taken || 0) / capacity);
      if ((s.taken || 0) === 0) reasons.push('Chưa có ai đặt – gần như không phải chờ');
      else if ((s.taken || 0) <= capacity * 0.3) reasons.push(`Ít người đặt (${s.taken}/${capacity})`);
      if (index === 0) {
        score += 1;
        reasons.push('Khung giờ trống sớm nhất');
      }
      return { time_slot: s.time_slot, taken: s.taken || 0, capacity, score: Math.round(score * 10) / 10, reasons };
    });
    scored.sort((a, b) => b.score - a.score || a.time_slot.localeCompare(b.time_slot));
    return {
      enabled: true,
      preferred_period: preferred,
      slots: scored.slice(0, limit || S.slot_suggestions)
    };
  }

  /** How useful the suggestions are: share of bookings made from a suggestion */
  async stats(days = 30) {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS total,
              SUM(booking_source = 'specialty') AS specialty,
              SUM(booking_source = 'slot') AS slot,
              SUM(booking_source = 'followup') AS followup,
              SUM(booking_source IS NOT NULL AND status IN ('checked_in', 'completed')) AS from_suggestion_attended,
              SUM(booking_source IS NOT NULL) AS from_suggestion
       FROM appointments
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    const n = (v) => Number(v || 0);
    const total = n(row.total);
    const fromSuggestion = n(row.from_suggestion);
    return {
      days,
      total_bookings: total,
      from_suggestion: fromSuggestion,
      rate: total ? Math.round((fromSuggestion / total) * 1000) / 10 : 0,
      by_type: { specialty: n(row.specialty), slot: n(row.slot), followup: n(row.followup) },
      attended_from_suggestion: n(row.from_suggestion_attended)
    };
  }
}

module.exports = new RecommendationService();
module.exports.fold = fold;
module.exports.jaccard = jaccard;
module.exports.tokens = tokens;
module.exports.pad = pad;
