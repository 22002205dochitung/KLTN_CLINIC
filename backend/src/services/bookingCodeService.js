/**
 * Booking number (mã lịch hẹn) shown to the patient right after booking:
 *
 *   YYMMDD-<department code>-<running number of that department on the exam day>
 *   25/11/2026, Tai - Mũi - Họng (TMH), first booking  ->  261125-TMH-001
 *
 * The running number comes from booking_counters (one row per department and day). The row is
 * locked until the booking transaction ends, so two people booking at the same moment can never
 * get the same number; a booking that fails (transaction rolled back) does not use up a number.
 * Department codes live in departments.code (initials of the name, editable by the admin).
 */

const pad2 = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' (or a Date) -> 'YYMMDD' */
const ymdShort = (date) => {
  if (date instanceof Date) {
    return `${pad2(date.getFullYear() % 100)}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  }
  const s = String(date).slice(0, 10);
  return `${s.slice(2, 4)}${s.slice(5, 7)}${s.slice(8, 10)}`;
};

const formatBookingCode = (date, deptCode, number) => `${ymdShort(date)}-${deptCode}-${String(number).padStart(3, '0')}`;

/** Accepts what a person may type at the desk: spaces, lower case */
const BOOKING_CODE_REGEX = /^\d{6}-[A-Z0-9]{1,10}-\d{3,}$/;
const normalizeBookingCode = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
const looksLikeBookingCode = (value) => BOOKING_CODE_REGEX.test(normalizeBookingCode(value));

/**
 * Gives the appointment its code, inside the caller's transaction (`conn`).
 * Called on booking, and again when the exam day or the department changes.
 * Returns the code, or null when the database was not migrated yet (booking still works).
 */
const assignBookingCode = async (conn, appointmentId, doctorId, appointmentDate) => {
  try {
    const [[dep]] = await conn.execute(
      `SELECT d.department_id, dep.code
       FROM doctors d JOIN departments dep ON dep.id = d.department_id
       WHERE d.id = ?`,
      [doctorId]
    );
    if (!dep) return null;
    const visitDate = appointmentDate instanceof Date
      ? `${appointmentDate.getFullYear()}-${pad2(appointmentDate.getMonth() + 1)}-${pad2(appointmentDate.getDate())}`
      : String(appointmentDate).slice(0, 10);

    // LAST_INSERT_ID(x) hands the new number back to this connection only
    await conn.execute(
      `INSERT INTO booking_counters (department_id, visit_date, last_no) VALUES (?, ?, LAST_INSERT_ID(1))
       ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
      [dep.department_id, visitDate]
    );
    const [[row]] = await conn.execute('SELECT LAST_INSERT_ID() AS n');
    const code = formatBookingCode(visitDate, dep.code || `K${dep.department_id}`, row.n);
    await conn.execute('UPDATE appointments SET booking_code = ? WHERE id = ?', [code, appointmentId]);
    return code;
  } catch (error) {
    if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
      console.warn('⚠️  Booking code skipped – run database/booking_code.sql');
      return null;
    }
    throw error;
  }
};

module.exports = {
  assignBookingCode,
  formatBookingCode,
  normalizeBookingCode,
  looksLikeBookingCode,
  ymdShort
};
