/**
 * Booking number shown to patients and staff: 261125-TMH-001
 * (exam day YYMMDD – department code – running number of that department that day).
 * Old bookings made before the code existed fall back to "#<id>".
 */
export const bookingCodeOf = (a) => a?.booking_code || a?.bookingCode || (a?.id != null ? `#${a.id}` : '');

export default bookingCodeOf;
