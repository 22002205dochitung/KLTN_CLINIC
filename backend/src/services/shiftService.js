const db = require('../config/database');
const { weekdayOf } = require('../config/booking');

/**
 * Doctor shifts (ca trực) decide which time slots can be booked.
 *  - A doctor without any shift row works the clinic's default hours (backward compatible).
 *  - Otherwise, for a given date: the shifts of that exact date if any, else the weekly shifts
 *    of that weekday. No shift that day = the doctor does not work.
 * Time slots are 30 minutes ("08:00-08:30"); a slot is bookable when it lies fully inside a shift.
 */

const toMin = (hhmm) => {
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmt = (t) => String(t).slice(0, 5);

/** Working windows of a doctor on a date: null = default hours, [] = not working, else [{start,end}] */
const getWindows = async (doctorId, date, conn = db.pool) => {
  const [rows] = await conn.execute(
    `SELECT weekday, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date, start_time, end_time
     FROM doctor_shifts WHERE doctor_id = ?`,
    [doctorId]
  );
  if (rows.length === 0) return null;
  const exact = rows.filter((r) => r.work_date === date);
  const chosen = exact.length ? exact : rows.filter((r) => r.work_date === null && Number(r.weekday) === weekdayOf(date));
  return chosen
    .map((r) => ({ start: fmt(r.start_time), end: fmt(r.end_time) }))
    .sort((a, b) => a.start.localeCompare(b.start));
};

const slotInWindows = (slot, windows) => {
  if (windows === null) return true;
  const [s, e] = String(slot).split('-');
  return windows.some((w) => toMin(s) >= toMin(w.start) && toMin(e) <= toMin(w.end));
};

const describe = (windows) => (windows && windows.length
  ? windows.map((w) => `${w.start}–${w.end}`).join(', ')
  : 'không có ca');

/** Throws OUTSIDE_SHIFT when the slot is not inside the doctor's shifts that day */
const assertSlotInShift = async (doctorId, date, slot, conn = db.pool) => {
  const windows = await getWindows(doctorId, date, conn);
  if (!slotInWindows(slot, windows)) {
    const err = new Error('OUTSIDE_SHIFT');
    err.detail = `Ca trực ngày này: ${describe(windows)}`;
    throw err;
  }
};

module.exports = { getWindows, slotInWindows, assertSlotInShift, describe, toMin };
