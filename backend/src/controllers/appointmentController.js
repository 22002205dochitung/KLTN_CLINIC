const appointmentService = require('../services/appointmentService');
const qrService = require('../services/qrService');
const db = require('../config/database');
const validator = require('validator');
const AuditLogService = require('../services/auditLogService');
const paymentService = require('../services/paymentService');
const { SLOT_CAPACITY } = require('../config/booking');

const TIME_SLOT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/;

/** Only a known method is stored; anything else falls back to null (decided at the desk) */
const normalizePaymentMethod = (method) =>
  paymentService.PAYMENT_METHODS.includes(method) ? method : null;

/** YYYY-MM-DD of "today" in server local time */
const todayStr = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Exam type + payment hold from the booking request.
 *  - insurance (BHYT): card number + expiry checked, paid at the counter (co-payment)
 *  - service + bank transfer: place held PAYMENT_HOLD_MINUTES until paid
 * Returns { error } or the fields for appointmentService.createAppointment.
 */
const readExamType = (body, appointmentDate, paymentMethod) => {
  const { validateInsurance, PAYMENT_HOLD_MINUTES } = require('../config/booking');
  if (body.examType === 'insurance') {
    const card = validateInsurance(body.insuranceNumber, body.insuranceExpiry, appointmentDate);
    if (card.error) return { error: card.error };
    return { examType: 'insurance', insuranceNumber: card.number, insuranceExpiry: card.expiry, holdMinutes: 0, coverage: card.coverage };
  }
  return { examType: 'service', holdMinutes: paymentMethod === 'bank_transfer' ? PAYMENT_HOLD_MINUTES : 0 };
};

/** Errors that mean "this day / time is not open for this doctor" */
const DAY_BLOCK_MESSAGES = {
  CLINIC_CLOSED: 'Phòng khám không làm việc ngày này. Vui lòng chọn ngày khác.',
  DOCTOR_ON_LEAVE: 'Bác sĩ nghỉ ngày này. Vui lòng chọn ngày khác hoặc bác sĩ khác.',
  NO_SHIFT: 'Bác sĩ không có ca trực ngày này. Vui lòng chọn ngày khác hoặc bác sĩ khác.',
  OUTSIDE_SHIFT: 'Khung giờ này nằm ngoài ca trực của bác sĩ. Vui lòng chọn khung giờ khác.'
};

/** True when the date is before today, or is today and the slot has already ended */
const isPastSlot = (date, timeSlot) => require('../config/booking').isSlotOver(date, timeSlot);

/**
 * Appointment Controller - Handles HTTP requests for appointment management
 * 
 * Endpoints:
 * - GET /api/appointments/doctors - Get departments and doctors list
 * - GET /api/appointments/slots - Get available time slots
 * - POST /api/appointments/create - Create new appointment
 * - GET /api/appointments/patient/:id - Get patient appointments
 * - PUT /api/appointments/:id/cancel - Cancel appointment
 * - PUT /api/appointments/:id/reschedule - Reschedule appointment
 * - POST /api/appointments/checkin - Check-in appointment with QR code
 * - POST /api/appointments/search - Manual patient lookup
 * 
 * Requirements: 1.1-1.3, 2.1-2.3, 3.1-3.8, 5.1-5.2, 6.1-6.4, 7.1-7.7, 9.1-9.6, 10.1-10.6, 22.1-22.8
 */

class AppointmentController {
  /**
   * Get list of departments and doctors
   * Public endpoint - no authentication required
   * 
   * GET /api/appointments/doctors
   * 
   * Requirements: 1.1, 1.2, 1.3, 1.4
   */
  async getDoctorsAndDepartments(req, res) {
    try {
      // Get all departments
      const departmentsQuery = `
        SELECT 
          id,
          name,
          description
        FROM departments
        ORDER BY name
      `;

      const [departments] = await db.pool.execute(departmentsQuery);

      // Get all doctors with their user info
      const doctorsQuery = `
        SELECT 
          d.id as doctor_id,
          d.user_id,
          d.department_id,
          d.degree,
          u.fullname as full_name,
          u.email,
          u.phone,
          dep.name as department_name,
          (SELECT ROUND(AVG(r.rating), 1) FROM appointment_reviews r WHERE r.doctor_id = d.id) as avg_rating,
          (SELECT COUNT(*) FROM appointment_reviews r WHERE r.doctor_id = d.id) as review_count
        FROM doctors d
        JOIN users u ON d.user_id = u.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE u.role = 'doctor'
        ORDER BY dep.name, u.fullname
      `;

      const [doctors] = await db.pool.execute(doctorsQuery);

      // Group doctors by department
      const departmentsWithDoctors = departments.map(dept => {
        const deptDoctors = doctors.filter(doc => doc.department_id === dept.id);
        
        return {
          ...dept,
          doctor_count: deptDoctors.length,
          doctors: deptDoctors
        };
      });

      res.json({
        success: true,
        departments: departmentsWithDoctors,
        doctors: doctors
      });
    } catch (error) {
      console.error('Error getting doctors and departments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy danh sách bác sĩ và khoa. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Get available time slots for a doctor on a specific date
   * Public/authenticated endpoint
   * 
   * GET /api/appointments/slots?doctorId=1&date=2026-10-25
   * 
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 22.1, 22.2, 22.3
   */
  async getAvailableSlots(req, res) {
    try {
      const { doctorId, date } = req.query;

      // Validation
      if (!doctorId || !date) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Thiếu thông tin doctor_id hoặc date',
            details: {
              doctorId: !doctorId ? 'Doctor ID is required' : undefined,
              date: !date ? 'Date is required' : undefined
            }
          }
        });
      }

      // Validate date format (YYYY-MM-DD)
      if (!validator.isDate(date, { format: 'YYYY-MM-DD', strictMode: true })) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Định dạng ngày không hợp lệ. Sử dụng YYYY-MM-DD'
          }
        });
      }

      // Check if date is in the past
      const selectedDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAST_DATE',
            message: 'Không thể đặt lịch vào ngày đã qua'
          }
        });
      }

      // Validate doctor exists
      const [doctorCheck] = await db.pool.execute(
        'SELECT d.id, u.fullname, dep.name as department FROM doctors d JOIN users u ON d.user_id = u.id JOIN departments dep ON d.department_id = dep.id WHERE d.id = ?',
        [doctorId]
      );

      if (doctorCheck.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Không tìm thấy bác sĩ'
          }
        });
      }

      const doctor = doctorCheck[0];

      // Get available slots
      const slots = await appointmentService.getAvailableSlots(doctorId, date);
      const dayBlock = await appointmentService.getDayBlock(doctorId, date);

      res.json({
        success: true,
        doctor: {
          id: doctorId,
          name: doctor.fullname,
          department: doctor.department
        },
        date: date,
        closed: dayBlock,
        slots: slots
      });
    } catch (error) {
      console.error('Error getting available slots:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy danh sách khung giờ. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Create a new appointment
   * Requires authentication (patient role)
   * 
   * POST /api/appointments/create
   * Body: { doctorId, appointmentDate, timeSlot }
   * 
   * Requirements: 3.1-3.8, 4.1-4.5, 7.1, 22.1-22.8
   */
  async createAppointment(req, res) {
    try {
      const {
        doctorId,
        appointmentDate,
        timeSlot,
        symptoms,
        paymentMethod,
        doctor_id,
        appointment_date,
        time_slot,
        payment_method
      } = req.body;

      const normalizedDoctorId = doctorId ?? doctor_id;
      const normalizedAppointmentDate = appointmentDate ?? appointment_date;
      const normalizedTimeSlot = timeSlot ?? time_slot;
      const normalizedSymptoms = symptoms ?? null;
      // Preferred payment method only. The fee comes from the price list and the booking
      // is always 'unpaid' until money is actually collected (cashier / payment gateway).
      // Never trust consultationFee / paymentStatus sent by the client.
      const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod ?? payment_method);
      const normalizedPaymentStatus = 'unpaid';

      // Get patient_id from authenticated user's JWT token (Requirement 7.1)
      const patientId = req.user.id; // From auth middleware

      // The appointment belongs to the caller, so only patients may use this endpoint.
      // Staff book for a patient through /public/create (by name + phone).
      if (req.user.role !== 'patient') {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Nhân viên đặt lịch hộ bệnh nhân bằng form có họ tên và số điện thoại' }
        });
      }

      // Validation
      const errors = {};

      if (!normalizedDoctorId) errors.doctorId = 'Doctor ID is required';
      if (!normalizedAppointmentDate) errors.appointmentDate = 'Appointment date is required';
      if (!normalizedTimeSlot) errors.timeSlot = 'Time slot is required';

      // Validate date format
      if (normalizedAppointmentDate && !validator.isDate(normalizedAppointmentDate, { format: 'YYYY-MM-DD', strictMode: true })) {
        errors.appointmentDate = 'Invalid date format. Use YYYY-MM-DD';
      }

      // Validate time slot format (HH:MM-HH:MM)
      if (normalizedTimeSlot && !/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.test(normalizedTimeSlot)) {
        errors.timeSlot = 'Invalid time slot format. Use HH:MM-HH:MM';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu đầu vào không hợp lệ',
            details: errors
          }
        });
      }

      // Check if date is not in the past
      const selectedDate = new Date(normalizedAppointmentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);

      if (selectedDate < today) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAST_APPOINTMENT',
            message: 'Không thể đặt lịch vào ngày đã qua'
          }
        });
      }

      // Validate doctor exists
      const [doctorCheck] = await db.pool.execute(
        `SELECT d.id FROM doctors d JOIN users u ON d.user_id = u.id
         WHERE d.id = ? AND u.role = 'doctor' AND d.department_id IS NOT NULL`,
        [normalizedDoctorId]
      );

      if (doctorCheck.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Không tìm thấy bác sĩ'
          }
        });
      }

      if (isPastSlot(normalizedAppointmentDate, normalizedTimeSlot)) {
        return res.status(400).json({
          success: false,
          error: { code: 'PAST_APPOINTMENT', message: 'Khung giờ này đã qua, vui lòng chọn khung giờ khác' }
        });
      }

      const normalizedConsultationFee = await paymentService.getConsultationFeeByDoctor(normalizedDoctorId);

      const appointment = await appointmentService.createAppointment({
        patientId,
        doctorId: normalizedDoctorId,
        appointmentDate: normalizedAppointmentDate,
        timeSlot: normalizedTimeSlot,
        symptoms: normalizedSymptoms,
        consultationFee: normalizedConsultationFee,
        paymentMethod: normalizedPaymentMethod,
        paymentStatus: normalizedPaymentStatus,
        bookingSource: req.body.bookingSource
      });

      console.log(`✅ Appointment created: ID ${appointment.id}, Patient: ${patientId}, Doctor: ${normalizedDoctorId}, Payment: ${normalizedPaymentStatus}`);

      await AuditLogService.logEvent({
        userId: patientId,
        eventType: 'appointment_created',
        eventDetails: JSON.stringify({
          appointmentId: appointment.id,
          doctorId: normalizedDoctorId,
          doctorName: appointment.doctor_name,
          appointmentDate: normalizedAppointmentDate,
          timeSlot: normalizedTimeSlot,
          consultationFee: normalizedConsultationFee,
          paymentMethod: normalizedPaymentMethod,
          paymentStatus: normalizedPaymentStatus,
          status: 'booked'
        }),
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        success: true,
        message: 'Đặt lịch khám thành công!',
        appointment: {
          id: appointment.id,
          patient_id: appointment.patient_id,
          patient_name: appointment.patient_name,
          doctor_id: appointment.doctor_id,
          doctor_name: appointment.doctor_name,
          department: appointment.department_name,
          appointment_date: appointment.appointment_date,
          time_slot: appointment.time_slot,
          symptoms: appointment.symptoms,
          consultation_fee: Number(appointment.consultation_fee ?? normalizedConsultationFee ?? 0),
          payment_method: appointment.payment_method || normalizedPaymentMethod || 'cash',
          payment_status: appointment.payment_status || normalizedPaymentStatus || 'unpaid',
          status: appointment.status,
          qr_code: appointment.qr_code,
          qr_code_token: appointment.qr_code_token,
          booking_code: appointment.booking_code || null,
          created_at: appointment.created_at
        }
      });
    } catch (error) {
      console.error('Error creating appointment:', error);

      if (DAY_BLOCK_MESSAGES[error.message]) {
        const message = DAY_BLOCK_MESSAGES[error.message] + (error.detail ? ` (${error.detail})` : '');
        return res.status(409).json({
          success: false,
          message,
          error: { code: error.message, message }
        });
      }

      if (error.message === 'DUPLICATE_BOOKING') {
        return res.status(409).json({
          success: false,
          message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.',
          error: { code: 'DUPLICATE_BOOKING', message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.' }
        });
      }

      if (error.message === 'SLOT_NOT_AVAILABLE') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLOT_NOT_AVAILABLE',
            message: `Khung giờ này đã đủ ${SLOT_CAPACITY} bệnh nhân. Vui lòng chọn khung giờ khác.`,
            details: {
              doctorId: req.body.doctorId || req.body.doctor_id,
              date: req.body.appointmentDate || req.body.appointment_date,
              timeSlot: req.body.timeSlot || req.body.time_slot
            }
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể tạo lịch hẹn. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Get appointments for a patient
   * Requires authentication (patient or staff role)
   * 
   * GET /api/appointments/patient/:id
   * 
   * Requirements: 5.1-5.7, 7.2
   */
  async getPatientAppointments(req, res) {
    try {
      // Route is /patient/:patientId (and /my-appointments sets patientId); keep :id as fallback
      const id = req.params.patientId ?? req.params.id;
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      if (!id || Number.isNaN(parseInt(id, 10))) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Mã bệnh nhân không hợp lệ' }
        });
      }

      // Authorization: patient can only view their own appointments (Requirement 7.2)
      // staff (receptionist, doctor, admin) can view any patient's appointments
      if (requestingUserRole === 'patient' && parseInt(id) !== requestingUserId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Bạn chỉ có thể xem lịch hẹn của mình'
          }
        });
      }

      // Get appointments filtered by authenticated user (Requirement 7.2)
      const appointments = await appointmentService.getPatientAppointments(id);

      // Separate into upcoming and past
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const upcoming = appointments.filter(apt => {
        const aptDate = new Date(apt.appointment_date);
        aptDate.setHours(0, 0, 0, 0);
        return aptDate >= today;
      }).sort((a, b) => {
        // Sort ascending (earliest first)
        if (a.appointment_date !== b.appointment_date) {
          return new Date(a.appointment_date) - new Date(b.appointment_date);
        }
        return a.time_slot.localeCompare(b.time_slot);
      });

      const past = appointments.filter(apt => {
        const aptDate = new Date(apt.appointment_date);
        aptDate.setHours(0, 0, 0, 0);
        return aptDate < today;
      }).sort((a, b) => {
        // Sort descending (most recent first)
        if (a.appointment_date !== b.appointment_date) {
          return new Date(b.appointment_date) - new Date(a.appointment_date);
        }
        return b.time_slot.localeCompare(a.time_slot);
      });

      res.json({
        success: true,
        appointments: {
          upcoming,
          past,
          total: appointments.length
        }
      });
    } catch (error) {
      console.error('Error getting patient appointments:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy danh sách lịch hẹn. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Cancel an appointment
   * Requires authentication (patient role)
   * 
   * PUT /api/appointments/:id/cancel
   * 
   * Requirements: 6.1-6.6, 7.4
   */
  async cancelAppointment(req, res) {
    try {
      const { id } = req.params;
      const patientId = req.user.id; // Get patient_id from authenticated user (Requirement 7.4)

      // Authentication check: patient can only cancel their own appointments
      const updatedAppointment = await appointmentService.cancelAppointment(id, patientId);

      console.log(`✅ Appointment cancelled: ID ${id}, Patient: ${patientId}`);

      // Log appointment cancellation to audit logs
      await AuditLogService.logEvent({
        userId: patientId,
        eventType: 'appointment_cancelled',
        eventDetails: JSON.stringify({
          appointmentId: id,
          doctorId: updatedAppointment.doctor_id,
          doctorName: updatedAppointment.doctor_name,
          appointmentDate: updatedAppointment.appointment_date,
          timeSlot: updatedAppointment.time_slot,
          previousStatus: 'booked',
          newStatus: 'cancelled'
        }),
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      });

      res.json({
        success: true,
        message: 'Hủy lịch hẹn thành công',
        appointment: updatedAppointment
      });
    } catch (error) {
      console.error('Error cancelling appointment:', error);

      if (error.message.includes('UNAUTHORIZED')) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Bạn không có quyền hủy lịch hẹn này'
          }
        });
      }

      if (error.message.includes('APPOINTMENT_NOT_FOUND')) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'APPOINTMENT_NOT_FOUND',
            message: 'Không tìm thấy lịch hẹn'
          }
        });
      }

      if (error.message.includes('CANNOT_CANCEL')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_CANCEL',
            message: error.message.replace('CANNOT_CANCEL: ', '')
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể hủy lịch hẹn. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Reschedule an appointment
   * Requires authentication (patient role)
   * 
   * PUT /api/appointments/:id/reschedule
   * Body: { appointmentDate, timeSlot }
   * 
   * Requirements: 7.1-7.7, 7.4
   */
  async rescheduleAppointment(req, res) {
    try {
      const { id } = req.params;
      const { appointmentDate, timeSlot } = req.body;
      const patientId = req.user.id; // Get patient_id from authenticated user (Requirement 7.4)

      // Validation
      const errors = {};

      if (!appointmentDate) errors.appointmentDate = 'Appointment date is required';
      if (!timeSlot) errors.timeSlot = 'Time slot is required';

      if (appointmentDate && !validator.isDate(appointmentDate, { format: 'YYYY-MM-DD', strictMode: true })) {
        errors.appointmentDate = 'Invalid date format';
      }

      if (timeSlot && !/^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/.test(timeSlot)) {
        errors.timeSlot = 'Invalid time slot format';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Dữ liệu không hợp lệ',
            details: errors
          }
        });
      }

      // Check if date is not in the past
      const selectedDate = new Date(appointmentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      selectedDate.setHours(0, 0, 0, 0);

      if (selectedDate < today || isPastSlot(appointmentDate, timeSlot)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAST_APPOINTMENT',
            message: 'Không thể đổi sang khung giờ đã qua'
          }
        });
      }

      // Get old appointment details before rescheduling
      const [oldAppointment] = await db.pool.execute(
        'SELECT appointment_date, time_slot FROM appointments WHERE id = ? AND patient_id = ?',
        [id, patientId]
      );

      // Authentication check: patient can only reschedule their own appointments
      const updatedAppointment = await appointmentService.rescheduleAppointment(
        id,
        patientId,
        { appointmentDate, timeSlot }
      );

      console.log(`✅ Appointment rescheduled: ID ${id}, Patient: ${patientId}`);

      // Log appointment reschedule to audit logs
      if (oldAppointment.length > 0) {
        await AuditLogService.logEvent({
          userId: patientId,
          eventType: 'appointment_rescheduled',
          eventDetails: JSON.stringify({
            appointmentId: id,
            doctorId: updatedAppointment.doctor_id,
            doctorName: updatedAppointment.doctor_name,
            oldDate: oldAppointment[0].appointment_date,
            oldTimeSlot: oldAppointment[0].time_slot,
            newDate: appointmentDate,
            newTimeSlot: timeSlot
          }),
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent')
        });
      }

      res.json({
        success: true,
        message: 'Đổi lịch hẹn thành công',
        appointment: updatedAppointment
      });
    } catch (error) {
      console.error('Error rescheduling appointment:', error);

      if (error.message === 'APPOINTMENT_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Không tìm thấy lịch hẹn' }
        });
      }

      if (error.message.includes('UNAUTHORIZED')) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Bạn không có quyền đổi lịch hẹn này'
          }
        });
      }

      if (DAY_BLOCK_MESSAGES[error.message]) {
        const message = DAY_BLOCK_MESSAGES[error.message] + (error.detail ? ` (${error.detail})` : '');
        return res.status(409).json({
          success: false,
          message,
          error: { code: error.message, message }
        });
      }

      if (error.message === 'DUPLICATE_BOOKING') {
        return res.status(409).json({
          success: false,
          message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.',
          error: { code: 'DUPLICATE_BOOKING', message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.' }
        });
      }

      if (error.message === 'SLOT_NOT_AVAILABLE') {
        return res.status(409).json({
          success: false,
          error: {
            code: 'SLOT_NOT_AVAILABLE',
            message: `Khung giờ này đã đủ ${SLOT_CAPACITY} bệnh nhân. Vui lòng chọn khung giờ khác.`
          }
        });
      }

      if (error.message.includes('CANNOT_RESCHEDULE')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'CANNOT_RESCHEDULE',
            message: error.message.replace('CANNOT_RESCHEDULE: ', '')
          }
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể đổi lịch hẹn. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * GET /api/appointments/doctor/schedule?from=YYYY-MM-DD&days=7
   * The logged-in doctor's appointments for a date range, plus today's counters.
   */
  async getDoctorSchedule(req, res) {
    try {
      const from = req.query.from || todayStr();
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 31);

      if (!validator.isDate(from, { format: 'YYYY-MM-DD', strictMode: true })) {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Ngày không hợp lệ' }
        });
      }

      const [doctorRows] = await db.pool.execute(
        'SELECT id FROM doctors WHERE user_id = ?',
        [req.user.id]
      );
      if (doctorRows.length === 0) {
        return res.status(404).json({
          success: false,
          error: { code: 'DOCTOR_NOT_FOUND', message: 'Tài khoản chưa được gán hồ sơ bác sĩ' }
        });
      }
      const doctorId = doctorRows[0].id;

      const [appointments] = await db.pool.execute(
        `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                a.time_slot, a.status, a.symptoms, a.payment_status, a.checked_in_at,
                u.id AS patient_id, u.fullname AS patient_name, u.phone AS patient_phone
         FROM appointments a
         JOIN users u ON u.id = a.patient_id
         WHERE a.doctor_id = ?
           AND a.appointment_date BETWEEN ? AND DATE_ADD(?, INTERVAL ? DAY)
         ORDER BY a.appointment_date, a.time_slot`,
        [doctorId, from, from, String(days - 1)]
      );

      const [todayRows] = await db.pool.execute(
        `SELECT status, COUNT(*) AS total
         FROM appointments
         WHERE doctor_id = ? AND appointment_date = CURDATE()
         GROUP BY status`,
        [doctorId]
      );
      const today = { booked: 0, checked_in: 0, completed: 0, cancelled: 0 };
      todayRows.forEach((r) => { today[r.status] = Number(r.total); });

      res.json({ success: true, doctorId, from, days, today, appointments });
    } catch (error) {
      console.error('Error getting doctor schedule:', error);
      res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Không thể tải lịch làm việc. Vui lòng thử lại sau.' }
      });
    }
  }

  /**
   * Check-in appointment using QR code
   * Requires authentication (receptionist or admin role)
   * 
   * POST /api/appointments/checkin
   * Body: { qrCodeToken }
   * 
   * Requirements: 9.1-9.7, 24.1, 7.4
   */
  async checkInAppointment(req, res) {
    try {
      // Accept the older `qrCode` field name too (the scanner used to send it)
      let qrCodeToken = String(req.body.qrCodeToken ?? req.body.qrCode ?? '').trim();

      // The desk may type the booking number printed on the slip (261125-TMH-001) instead of scanning
      const bookingCodes = require('../services/bookingCodeService');
      if (bookingCodes.looksLikeBookingCode(qrCodeToken)) {
        const [rows] = await db.pool.execute(
          'SELECT qr_code_token FROM appointments WHERE booking_code = ?',
          [bookingCodes.normalizeBookingCode(qrCodeToken)]
        );
        if (rows.length) qrCodeToken = rows[0].qr_code_token;
      }

      // Authentication check: only receptionist or admin can check-in (enforced by route middleware)
      // req.user contains authenticated user information
      if (!qrCodeToken) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Mã QR không được để trống'
          }
        });
      }

      // Verify token
      const verification = await qrService.verifyTokenForCheckIn(qrCodeToken);

      if (!verification.valid) {
        // Scanned again after checking in: give the desk the ticket number to tell the patient
        const already = verification.appointment?.status === 'checked_in';
        console.log(`⚠️  Check-in refused (${verification.appointment ? `appointment ${verification.appointment.id}` : 'unknown code'}): ${verification.reason}`);
        const queue = already
          ? await require('./queueController').getTicketInfo(verification.appointment.id).catch(() => null)
          : null;
        return res.status(400).json({
          success: false,
          error: {
            code: already ? 'ALREADY_CHECKED_IN' : 'INVALID_QR_CODE',
            message: verification.reason,
            details: verification.appointment,
            queue
          }
        });
      }

      // Update status to checked_in using transaction
      const updatedAppointment = await appointmentService.updateAppointmentStatus(
        verification.appointment.id,
        'checked_in'
      );

      console.log(`✅ Check-in successful: Appointment ${verification.appointment.id}, Patient: ${verification.appointment.patient_name}`);

      // Log check-in to audit logs
      await AuditLogService.logEvent({
        userId: req.user.id, // Receptionist/admin who performed check-in
        eventType: 'appointment_checkin',
        eventDetails: JSON.stringify({
          appointmentId: verification.appointment.id,
          patientId: verification.appointment.patient_id,
          patientName: verification.appointment.patient_name,
          doctorId: verification.appointment.doctor_id,
          doctorName: verification.appointment.doctor_name,
          appointmentDate: verification.appointment.appointment_date,
          timeSlot: verification.appointment.time_slot,
          qrCodeToken: qrCodeToken,
          checkedInBy: req.user.fullname || req.user.email
        }),
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      });

      // Ticket number for today's queue (shown at the desk and on the lobby screen)
      const queue = await require('./queueController').getTicketInfo(verification.appointment.id);

      res.json({
        success: true,
        message: queue ? `Check-in thành công! Số thứ tự: ${queue.ticket_number}` : 'Check-in thành công!',
        appointment: updatedAppointment,
        queue
      });
    } catch (error) {
      console.error('Error during check-in:', error);

      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể check-in. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Manual patient lookup for check-in
   * Requires authentication (receptionist or admin role)
   * 
   * POST /api/appointments/search
   * Body: { searchType: 'name' | 'phone', searchValue: string }
   * 
   * Requirements: 10.1-10.6, 7.4
   */
  async searchPatients(req, res) {
    try {
      const { searchType, searchValue } = req.body;

      // Authentication check: only receptionist or admin can search (enforced by route middleware)
      // req.user contains authenticated user information
      if (!searchType || !searchValue) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Thiếu thông tin tìm kiếm'
          }
        });
      }

      let query = `
        SELECT 
          a.id,
          a.patient_id,
          a.doctor_id,
          a.appointment_date,
          a.time_slot,
          a.symptoms,
          a.status,
          a.qr_code_token,
          a.booking_code,
          u.fullname as patient_name,
          u.phone as patient_phone,
          d.degree,
          ud.fullname as doctor_name,
          dept.name as department_name,
          a.created_at
         FROM appointments a
         JOIN users u ON a.patient_id = u.id
         JOIN doctors d ON a.doctor_id = d.id
         JOIN users ud ON d.user_id = ud.id
         JOIN departments dept ON d.department_id = dept.id
         WHERE a.appointment_date = CURDATE()
          AND a.status = 'booked'
      `;

      const params = [];

      if (searchType === 'name') {
        query += ' AND u.fullname LIKE ?';
        params.push(`%${searchValue}%`);
      } else if (searchType === 'phone') {
        query += ' AND u.phone = ?';
        params.push(searchValue);
      } else {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Loại tìm kiếm không hợp lệ. Sử dụng "name" hoặc "phone"'
          }
        });
      }

      query += ' ORDER BY a.time_slot';

      const [results] = await db.pool.execute(query, params);

      res.json({
        success: true,
        count: results.length,
        appointments: results
      });
    } catch (error) {
      console.error('Error searching patients:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể tìm kiếm bệnh nhân. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Create public appointment (without login)
   * POST /api/appointments/public/create
   * 
   * Body: { fullName, phone, doctorId, appointmentDate, timeSlot, symptoms? }
   */
  async createPublicAppointment(req, res) {
    // Guest account created by THIS request; removed again if the booking then fails
    let createdGuestId = null;
    try {
      const { fullName, phone, doctorId, appointmentDate, timeSlot, symptoms, paymentMethod } = req.body;

      // ---- Validation ----
      if (!fullName || !String(fullName).trim()) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên' });
      }
      if (!phone || !/^0[0-9]{9}$/.test(String(phone).trim())) {
        return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)' });
      }
      if (!doctorId || !appointmentDate || !timeSlot) {
        return res.status(400).json({ success: false, message: 'Vui lòng chọn đầy đủ thông tin khám' });
      }
      if (!validator.isDate(String(appointmentDate), { format: 'YYYY-MM-DD', strictMode: true })) {
        return res.status(400).json({ success: false, message: 'Ngày khám không hợp lệ' });
      }
      if (!TIME_SLOT_REGEX.test(String(timeSlot))) {
        return res.status(400).json({ success: false, message: 'Khung giờ không hợp lệ' });
      }
      if (isPastSlot(appointmentDate, timeSlot)) {
        return res.status(400).json({ success: false, message: 'Khung giờ này đã qua, vui lòng chọn khung giờ khác' });
      }
      // BHYT is paid at the counter (co-payment), never by online transfer
      const examInfo = readExamType(req.body, appointmentDate, req.body.examType === 'insurance' ? 'cash' : paymentMethod);
      if (examInfo.error) {
        return res.status(400).json({ success: false, message: examInfo.error, error: { code: 'INVALID_INSURANCE', message: examInfo.error } });
      }

      const [doctorCheck] = await db.pool.execute(`SELECT d.id FROM doctors d JOIN users u ON d.user_id = u.id
         WHERE d.id = ? AND u.role = 'doctor' AND d.department_id IS NOT NULL`, [doctorId]);
      if (doctorCheck.length === 0) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy bác sĩ' });
      }

      const cleanName = String(fullName).trim();
      const cleanPhone = String(phone).trim();

      // ---- Resolve the patient account ----
      // A logged-in patient books for themselves. Staff (receptionist/admin) book on
      // behalf of the person identified by name + phone, never for their own account.
      let userId = null;
      if (req.user && req.user.role === 'patient') {
        userId = Number(req.user.id);
      } else {
        const [existingUsers] = await db.pool.execute(
          'SELECT id, role FROM users WHERE phone = ?',
          [cleanPhone]
        );
        if (existingUsers.length > 0) {
          if (existingUsers[0].role !== 'patient') {
            return res.status(409).json({
              success: false,
              message: 'Số điện thoại này thuộc tài khoản nhân viên, không thể dùng để đặt lịch khám'
            });
          }
          userId = existingUsers[0].id;
        } else {
          // Closed day / doctor on leave / full slot: answer before creating anything
          const dayBlock = await appointmentService.getDayBlock(doctorId, appointmentDate);
          if (dayBlock) {
            throw new Error(dayBlock.code);
          }
          await require('../services/shiftService').assertSlotInShift(doctorId, appointmentDate, timeSlot);
          if (!(await appointmentService.checkSlotAvailability(doctorId, appointmentDate, timeSlot))) {
            throw new Error('SLOT_NOT_AVAILABLE');
          }
          // Guest account: cannot log in until the person registers with this phone number
          const [insertResult] = await db.pool.execute(
            `INSERT INTO users (fullname, phone, email, password, role, created_at, email_verified)
             VALUES (?, ?, ?, 'N/A', 'patient', NOW(), 0)`,
            [cleanName, cleanPhone, `guest_${cleanPhone}@temp.com`]
          );
          userId = insertResult.insertId;
          createdGuestId = userId;
        }
      }

      // ---- Create (slot lock + unique QR inside one transaction) ----
      const consultationFee = await paymentService.getConsultationFeeByDoctor(doctorId);
      const appointment = await appointmentService.createAppointment({
        patientId: userId,
        doctorId,
        appointmentDate,
        timeSlot,
        symptoms: symptoms ? String(symptoms).trim() : null,
        consultationFee,
        paymentMethod: examInfo.examType === 'insurance' ? 'cash' : normalizePaymentMethod(paymentMethod),
        paymentStatus: 'unpaid',
        bookingSource: req.body.bookingSource,
        examType: examInfo.examType,
        insuranceNumber: examInfo.insuranceNumber,
        insuranceExpiry: examInfo.insuranceExpiry,
        holdMinutes: examInfo.holdMinutes
      });

      await AuditLogService.logActivity({
        userId: req.user ? req.user.id : userId,
        eventType: 'public_appointment_created',
        eventDetails: {
          appointmentId: appointment.id,
          patientId: userId,
          patientName: cleanName,
          doctorId: Number(doctorId),
          doctorName: appointment.doctor_name,
          appointmentDate,
          timeSlot,
          bookedBy: req.user ? req.user.role : 'guest'
        },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent')
      });

      res.status(201).json({
        success: true,
        message: 'Đặt lịch thành công!',
        appointment: {
          ...appointment,
          consultationFee: Number(appointment.consultation_fee ?? consultationFee),
          paymentMethod: appointment.payment_method,
          paymentStatus: appointment.payment_status
        }
      });
    } catch (error) {
      // The booking failed: do not leave behind the guest account this request just created
      if (createdGuestId) {
        try {
          await db.pool.execute(
            `DELETE FROM users
             WHERE id = ? AND password = 'N/A'
               AND NOT EXISTS (SELECT 1 FROM appointments WHERE patient_id = ?)`,
            [createdGuestId, createdGuestId]
          );
        } catch (cleanupError) {
          console.error('Could not remove unused guest account:', cleanupError.message);
        }
      }

      if (DAY_BLOCK_MESSAGES[error.message]) {
        const message = DAY_BLOCK_MESSAGES[error.message] + (error.detail ? ` (${error.detail})` : '');
        return res.status(409).json({
          success: false,
          message,
          error: { code: error.message, message }
        });
      }

      if (error.message === 'DUPLICATE_BOOKING') {
        return res.status(409).json({
          success: false,
          message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.',
          error: { code: 'DUPLICATE_BOOKING', message: 'Bạn đã có lịch với bác sĩ này ở khung giờ đó rồi.' }
        });
      }

      if (error.message === 'SLOT_NOT_AVAILABLE') {
        return res.status(409).json({
          success: false,
          message: `Khung giờ này đã đủ ${SLOT_CAPACITY} bệnh nhân. Vui lòng chọn khung giờ khác.`,
          error: { code: 'SLOT_NOT_AVAILABLE', message: `Khung giờ này đã đủ ${SLOT_CAPACITY} bệnh nhân. Vui lòng chọn khung giờ khác.` }
        });
      }
      console.error('Public booking error:', error);
      res.status(500).json({
        success: false,
        message: 'Có lỗi xảy ra. Vui lòng thử lại.'
      });
    }
  }

  /**
   * Get doctor's queue (alias for queueController)
   * Requires authentication (doctor or admin role)
   *
   * GET /api/appointments/queue/:doctorId
   */
  async getDoctorQueue(req, res) {
    try {
      const { doctorId } = req.params;
      const requestingUserId = req.user.id;
      const requestingUserRole = req.user.role;

      if (requestingUserRole === 'doctor') {
        const [doctorCheck] = await db.pool.execute(
          'SELECT id FROM doctors WHERE id = ? AND user_id = ?',
          [doctorId, requestingUserId]
        );

        if (doctorCheck.length === 0) {
          return res.status(403).json({
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Bạn chỉ có thể xem hàng đợi của mình'
            }
          });
        }
      }

      const [doctorInfo] = await db.pool.execute(
        `SELECT 
          d.id,
          u.fullname as doctor_name,
          d.degree,
          dep.name as department_name
        FROM doctors d
        JOIN users u ON d.user_id = u.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE d.id = ?`,
        [doctorId]
      );

      if (doctorInfo.length === 0) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'DOCTOR_NOT_FOUND',
            message: 'Không tìm thấy bác sĩ'
          }
        });
      }

      const queueQuery = `
        SELECT 
          a.id as appointment_id,
          a.patient_id,
          a.appointment_date,
          a.time_slot,
          a.status,
          COALESCE(a.checked_in_at, a.created_at) as checked_in_time,
          u.fullname as patient_name,
          u.phone as patient_phone,
          u.email as patient_email,
          mr.symptoms
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        LEFT JOIN medical_records mr ON a.id = mr.appointment_id
        WHERE a.doctor_id = ?
          AND a.status = 'checked_in'
          AND a.appointment_date = CURDATE()
        ORDER BY COALESCE(a.checked_in_at, a.created_at) ASC, a.id ASC
      `;

      const [queueResults] = await db.pool.execute(queueQuery, [doctorId]);
      const queueWithPositions = queueResults.map((entry, index) => ({
        ...entry,
        queue_position: index + 1
      }));

      res.json({
        success: true,
        doctor: {
          id: doctorInfo[0].id,
          name: doctorInfo[0].doctor_name,
          degree: doctorInfo[0].degree,
          department: doctorInfo[0].department_name
        },
        queue: queueWithPositions,
        queue_count: queueWithPositions.length,
        date: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error('Error getting doctor queue:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Không thể lấy hàng đợi. Vui lòng thử lại sau.'
        }
      });
    }
  }

  /**
   * Get available time slots (public endpoint)
   * GET /api/appointments/slots?doctorId=X&date=YYYY-MM-DD
   */
  async getPublicAvailableSlots(req, res) {
    try {
      const { doctorId, date } = req.query;

      if (!doctorId || !date) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu thông tin doctorId hoặc date'
        });
      }

      const slotsList = [];
      for (let hour = 7; hour <= 19; hour++) {
        const start = `${String(hour).padStart(2, '0')}:00`;
        const firstRange = `${start}-${String(hour).padStart(2, '0')}:30`;
        slotsList.push(firstRange);

        if (hour < 19) {
          const secondRange = `${String(hour).padStart(2, '0')}:30-${String(hour + 1).padStart(2, '0')}:00`;
          slotsList.push(secondRange);
        }
      }

      const [bookedSlots] = await db.pool.execute(
        `SELECT time_slot 
         FROM appointments 
         WHERE doctor_id = ? 
         AND appointment_date = ? 
         AND status IN ('booked', 'checked_in')`,
        [doctorId, date]
      );

      const bookedTimes = bookedSlots.map(slot => slot.time_slot);
      const slots = slotsList.map(timeSlot => ({
        timeSlot,
        available: !bookedTimes.includes(timeSlot)
      }));

      res.json({ success: true, slots });
    } catch (error) {
      console.error('Get slots error:', error);
      res.status(500).json({
        success: false,
        message: 'Không thể tải khung giờ'
      });
    }
  }
}

// Export singleton instance
module.exports = new AppointmentController();
