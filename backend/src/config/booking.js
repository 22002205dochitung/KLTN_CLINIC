/**
 * Booking rules.
 *
 * SLOT_CAPACITY: how many patients one doctor accepts in the same 30-minute slot.
 * Patients who booked the same slot are seen in check-in order (the queue).
 * Override with SLOT_CAPACITY=<n> in backend/.env (1-50). Default 10.
 */
const parsed = parseInt(process.env.SLOT_CAPACITY, 10);
const SLOT_CAPACITY = Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 10;

/**
 * AVG_EXAM_MINUTES: fallback length of one consultation, used for the waiting-time estimate
 * until the doctor has finished enough patients today to measure the real pace. Default 10.
 */
const parsedAvg = parseInt(process.env.AVG_EXAM_MINUTES, 10);
const AVG_EXAM_MINUTES = Number.isInteger(parsedAvg) && parsedAvg >= 2 && parsedAvg <= 60 ? parsedAvg : 10;

/**
 * CLINIC_CLOSED_WEEKDAYS: days the clinic does not take bookings, as JavaScript weekday numbers
 * (0 = Sunday ... 6 = Saturday), comma separated. Default "0" (closed on Sunday). Empty = open daily.
 */
/**
 * CLINIC_OPEN_24H=1 (testing): open every day, round the clock – 48 half-hour slots, no closed
 * weekday. Remove the line (or set 0) to go back to the normal opening hours below.
 */
const OPEN_24H = ['1', 'true', 'yes', 'on'].includes(String(process.env.CLINIC_OPEN_24H || '').trim().toLowerCase());

const rawClosed = process.env.CLINIC_CLOSED_WEEKDAYS;
const CLINIC_CLOSED_WEEKDAYS = OPEN_24H ? [] : (rawClosed === undefined ? '0' : rawClosed)
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);

const pad2s = (n) => String(n).padStart(2, '0');
const halfHourSlots = (fromMin, toMin) => {
  const out = [];
  for (let m = fromMin; m < toMin; m += 30) {
    const end = Math.min(m + 30, 24 * 60 - 1); // last slot of the day ends 23:59 (no "24:00")
    out.push(`${pad2s(Math.floor(m / 60))}:${pad2s(m % 60)}-${pad2s(Math.floor(end / 60))}:${pad2s(end % 60)}`);
  }
  return out;
};

/** Bookable 30-minute slots: 08:00–12:00 and 14:00–17:00, or the whole day when OPEN_24H */
const TIME_SLOTS = OPEN_24H
  ? halfHourSlots(0, 24 * 60)
  : [...halfHourSlots(8 * 60, 12 * 60), ...halfHourSlots(14 * 60, 17 * 60)];
const OPENING_HOURS = OPEN_24H
  ? [{ start: '00:00', end: '24:00' }]
  : [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '17:00' }];

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** 'YYYY-MM-DD' -> weekday number, computed on the calendar date (no timezone shift) */
const weekdayOf = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const isClinicClosed = (ymd) => CLINIC_CLOSED_WEEKDAYS.includes(weekdayOf(ymd));

const pad2 = (n) => String(n).padStart(2, '0');
const localYmd = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * A slot can be booked until it ENDS (like a hospital taking walk-ins during opening hours):
 * at 16:35 the 16:30-17:00 slot is still open, it closes at 17:00.
 * Returns true for a past date, or for today when the slot's end time has passed.
 */
const isSlotOver = (ymd, timeSlot, now = new Date()) => {
  const today = localYmd(now);
  if (String(ymd) < today) return true;
  if (String(ymd) > today || !timeSlot) return false;
  // Test mode (CLINIC_OPEN_24H=1): every slot of today stays bookable, even the hours already passed
  if (OPEN_24H) return false;
  const parts = String(timeSlot).split('-');
  const end = toMinutes(parts[1] || parts[0]);
  return end <= now.getHours() * 60 + now.getMinutes();
};

/**
 * PAYMENT_HOLD_MINUTES: a booking paid by bank transfer online keeps its place this long; when it is
 * still unpaid (and the patient did not report a transfer) it is cancelled automatically and the slot
 * is freed. Paying at the counter needs no hold (booking is confirmed straight away). Default 15.
 */
const parsedHold = parseInt(process.env.PAYMENT_HOLD_MINUTES, 10);
const PAYMENT_HOLD_MINUTES = Number.isInteger(parsedHold) && parsedHold >= 5 && parsedHold <= 1440 ? parsedHold : 15;

/**
 * Vietnamese health insurance card (thẻ BHYT, mẫu 15 ký tự):
 *   2 letters  object code (DN, HC, HS, SV, TE, GD ...)
 *   1 digit    benefit level 1–5 (mức hưởng)
 *   2 digits   province code
 *   10 digits  social insurance number (mã số BHXH)
 * Benefit level -> share paid by the insurance (đúng tuyến).
 */
const INSURANCE_COVERAGE = { 1: 100, 2: 100, 3: 95, 4: 80, 5: 100 };
const INSURANCE_REGEX = /^[A-Z]{2}[1-5]\d{12}$/;

const validateInsurance = (number, expiry, appointmentDate) => {
  const card = String(number || '').replace(/\s+/g, '').toUpperCase();
  if (!INSURANCE_REGEX.test(card)) {
    return { error: 'Số thẻ BHYT không hợp lệ (15 ký tự, VD: DN4797915396725)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiry || ''))) {
    return { error: 'Vui lòng nhập hạn sử dụng thẻ BHYT' };
  }
  if (String(expiry) < String(appointmentDate)) {
    return { error: 'Thẻ BHYT hết hạn trước ngày khám – vui lòng gia hạn thẻ hoặc chọn khám dịch vụ' };
  }
  const level = Number(card[2]);
  return { number: card, expiry: String(expiry), coverage: INSURANCE_COVERAGE[level] };
};

module.exports = {
  SLOT_CAPACITY,
  AVG_EXAM_MINUTES,
  CLINIC_CLOSED_WEEKDAYS,
  OPEN_24H,
  TIME_SLOTS,
  OPENING_HOURS,
  WEEKDAY_NAMES,
  weekdayOf,
  isClinicClosed,
  isSlotOver,
  localYmd,
  PAYMENT_HOLD_MINUTES,
  INSURANCE_COVERAGE,
  validateInsurance
};
