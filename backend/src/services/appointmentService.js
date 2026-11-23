const db = require('../config/database');
const qrService = require('./qrService');
const shiftService = require('./shiftService');
const { assignBookingCode } = require('./bookingCodeService');
const { SLOT_CAPACITY, isClinicClosed, weekdayOf, WEEKDAY_NAMES, isSlotOver } = require('../config/booking');

/**
 * Appointment Service - Business logic for appointment management
 * 
 * Handles:
 * - Appointment creation with QR code generation
 * - Slot availability checking
 * - Appointment ownership validation
 * - Status updates with validation
 * - Database transaction management
 * 
 * Requirements: 3.1-3.8, 24.1
 */

class AppointmentService {
  /**
   * Why a doctor cannot be booked on a date, or null when the day is open.
   * Clinic closing days come first, then the doctor's own days off.
   *
   * @param {number} doctorId
   * @param {string} date - YYYY-MM-DD
   * @param {object} [conn] - connection inside a transaction (defaults to the pool)
   * @returns {Promise<null|{code: string, message: string, reason?: string}>}
   */
  async getDayBlock(doctorId, date, conn = db.pool) {
    if (isClinicClosed(date)) {
      return {
        code: 'CLINIC_CLOSED',
        message: `Phòng khám nghỉ ${WEEKDAY_NAMES[weekdayOf(date)]}. Vui lòng chọn ngày khác.`
      };
    }
    const [leaves] = await conn.execute(
      'SELECT reason FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ?',
      [doctorId, date]
    );
    if (leaves.length > 0) {
      return {
        code: 'DOCTOR_ON_LEAVE',
        message: 'Bác sĩ nghỉ ngày này. Vui lòng chọn ngày khác hoặc bác sĩ khác.',
        reason: leaves[0].reason || null
      };
    }
    // the doctor has shifts, but none on this day
    const windows = await shiftService.getWindows(doctorId, date, conn);
    if (windows && windows.length === 0) {
      return {
        code: 'NO_SHIFT',
        message: 'Bác sĩ không có ca trực ngày này. Vui lòng chọn ngày khác hoặc bác sĩ khác.'
      };
    }
    return null;
  }

  /**
   * Check if a time slot is available for booking
   * 
   * @param {number} doctorId - Doctor ID
   * @param {string} date - Appointment date (YYYY-MM-DD)
   * @param {string} timeSlot - Time slot (HH:MM-HH:MM)
   * @returns {Promise<boolean>} True if slot is available
   * 
   * Requirement 3.4: Prevent double-booking by validating slot availability
   */
  async checkSlotAvailability(doctorId, date, timeSlot) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM appointments
        WHERE doctor_id = ?
          AND appointment_date = ?
          AND time_slot = ?
          AND status IN ('booked', 'checked_in')
      `;

      const [results] = await db.pool.execute(query, [doctorId, date, timeSlot]);
      
      return results[0].count < SLOT_CAPACITY;
    } catch (error) {
      console.error('Error checking slot availability:', error);
      throw new Error('Failed to check slot availability');
    }
  }

  /**
   * Create a new appointment with transaction support
   * 
   * @param {Object} data - Appointment data
   * @param {number} data.patientId - Patient user ID
   * @param {number} data.doctorId - Doctor ID
   * @param {string} data.appointmentDate - Date (YYYY-MM-DD)
   * @param {string} data.timeSlot - Time slot (HH:MM-HH:MM)
   * @returns {Promise<Object>} Created appointment with QR code
   * 
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 24.1
   */
  async createAppointment(data) {
    const { patientId, doctorId, appointmentDate, timeSlot, symptoms = null, consultationFee = 0, paymentMethod = null, paymentStatus = 'unpaid' } = data;
    // which smart suggestion led to this booking (for measuring the recommendation module)
    const bookingSource = ['specialty', 'slot', 'followup'].includes(data.bookingSource) ? data.bookingSource : null;
    // Khám dịch vụ / BHYT; online transfer -> the place is held for holdMinutes until paid
    const examType = data.examType === 'insurance' ? 'insurance' : 'service';
    const insuranceNumber = examType === 'insurance' ? data.insuranceNumber : null;
    const insuranceExpiry = examType === 'insurance' ? data.insuranceExpiry : null;
    const holdMinutes = Number(data.holdMinutes) > 0 ? Number(data.holdMinutes) : 0;

    return await db.transaction(async (connection) => {
      // 0. Clinic closed / doctor on leave
      const block = await this.getDayBlock(doctorId, appointmentDate, connection);
      if (block) {
        throw new Error(block.code);
      }
      await shiftService.assertSlotInShift(doctorId, appointmentDate, timeSlot, connection);

      // 1. Check slot availability (with row lock)
      const slotCheckQuery = `
        SELECT COUNT(*) as count
        FROM appointments
        WHERE doctor_id = ?
          AND appointment_date = ?
          AND time_slot = ?
          AND status IN ('booked', 'checked_in')
        FOR UPDATE
      `;

      const [slotResults] = await connection.execute(
        slotCheckQuery,
        [doctorId, appointmentDate, timeSlot]
      );

      if (slotResults[0].count >= SLOT_CAPACITY) {
        throw new Error('SLOT_NOT_AVAILABLE');
      }

      // 1b. The same patient cannot hold two places in the same slot with the same doctor
      const [dupResults] = await connection.execute(
        `SELECT COUNT(*) as count
         FROM appointments
         WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ? AND patient_id = ?
           AND status IN ('booked', 'checked_in')`,
        [doctorId, appointmentDate, timeSlot, patientId]
      );
      if (dupResults[0].count > 0) {
        throw new Error('DUPLICATE_BOOKING');
      }

      // 2. Generate unique QR code token
      let qrCodeToken;
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        qrCodeToken = qrService.generateUniqueToken();
        
        // Check uniqueness within transaction
        const [tokenCheck] = await connection.execute(
          'SELECT COUNT(*) as count FROM appointments WHERE qr_code_token = ?',
          [qrCodeToken]
        );

        if (tokenCheck[0].count === 0) {
          break; // Token is unique
        }

        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error('Failed to generate unique QR code token');
        }
      }

      // 3. Insert appointment with payment fields
      const insertQuery = `
        INSERT INTO appointments 
        (patient_id, doctor_id, appointment_date, time_slot, symptoms, qr_code_token, status,
         consultation_fee, payment_method, payment_status, booking_source,
         exam_type, insurance_number, insurance_expiry, hold_expires_at)
        VALUES (?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?, ?, ?, ?, ?,
                IF(? > 0, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL))
      `;

      const [insertResult] = await connection.execute(insertQuery, [
        patientId,
        doctorId,
        appointmentDate,
        timeSlot,
        symptoms,
        qrCodeToken,
        consultationFee,
        paymentMethod,
        paymentStatus,
        bookingSource,
        examType,
        insuranceNumber,
        insuranceExpiry,
        holdMinutes,
        holdMinutes
      ]);

      const appointmentId = insertResult.insertId;

      // Booking number for the patient: YYMMDD-<department code>-<running number>, e.g. 261125-TMH-001
      await assignBookingCode(connection, appointmentId, doctorId, appointmentDate);

      // 4. Auto-create consultation payment transaction when booking is paid immediately
      const normalizedPaymentStatus = String(paymentStatus || 'unpaid').toLowerCase();
      const normalizedPaymentMethod = paymentMethod || 'cash';
      const amount = Number(consultationFee) || 0;

      if (amount > 0 && ['paid', 'completed'].includes(normalizedPaymentStatus)) {
        const [existingTx] = await connection.execute(
          `SELECT id
           FROM payment_transactions
           WHERE transaction_type = 'consultation' AND reference_id = ?
           LIMIT 1`,
          [appointmentId]
        );

        if (existingTx.length === 0) {
          await connection.execute(
            `INSERT INTO payment_transactions
             (transaction_type, reference_id, patient_id, amount,
              payment_method, payment_status, paid_at, created_by)
             VALUES ('consultation', ?, ?, ?, ?, 'completed', NOW(), ?)`,
            [appointmentId, patientId, amount, normalizedPaymentMethod, patientId]
          );
        }
      }

      // 5. Fetch complete appointment details
      const fetchQuery = `
        SELECT 
          a.id,
          a.patient_id,
          a.doctor_id,
          a.appointment_date,
          a.time_slot,
          a.qr_code_token,
          a.booking_code,
          a.status,
          a.created_at,
          a.symptoms,
          a.consultation_fee,
          a.payment_method,
          a.payment_status,
          a.exam_type,
          a.insurance_number,
          DATE_FORMAT(a.insurance_expiry, '%Y-%m-%d') AS insurance_expiry,
          a.hold_expires_at,
          TIMESTAMPDIFF(SECOND, NOW(), a.hold_expires_at) AS hold_seconds_left,
          u.fullname as patient_name,
          u.phone as patient_phone,
          u.email as patient_email,
          du.fullname as doctor_name,
          d.degree as doctor_degree,
          dep.name as department_name,
          dep.id as department_id
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users du ON d.user_id = du.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE a.id = ?
      `;

      const [appointmentResults] = await connection.execute(fetchQuery, [appointmentId]);
      const appointment = appointmentResults[0];

      // 6. Generate QR code image
      const qrCodeImage = await qrService.generateQRCode(qrCodeToken);

      return {
        ...appointment,
        qr_code: qrCodeImage
      };
    });
  }

  /**
   * Get appointment by ID with full details
   * 
   * @param {number} id - Appointment ID
   * @returns {Promise<Object|null>} Appointment details or null
   * 
   * Requirement 3.5: Return appointment details
   */
  async getAppointmentById(id) {
    try {
      const query = `
        SELECT 
          a.id,
          a.patient_id,
          a.doctor_id,
          a.appointment_date,
          a.time_slot,
          a.qr_code_token,
          a.booking_code,
          a.status,
          a.created_at,
          u.fullname as patient_name,
          u.phone as patient_phone,
          u.email as patient_email,
          du.fullname as doctor_name,
          d.degree as doctor_degree,
          dep.name as department_name,
          dep.id as department_id
        FROM appointments a
        JOIN users u ON a.patient_id = u.id
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users du ON d.user_id = du.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE a.id = ?
      `;

      const [results] = await db.pool.execute(query, [id]);
      
      if (results.length === 0) {
        return null;
      }

      const appointment = results[0];

      // Generate QR code if status is booked
      if (appointment.status === 'booked') {
        const qrCodeImage = await qrService.generateQRCode(appointment.qr_code_token);
        appointment.qr_code = qrCodeImage;
      }

      return appointment;
    } catch (error) {
      console.error('Error getting appointment by ID:', error);
      throw new Error('Failed to retrieve appointment');
    }
  }

  /**
   * Get appointments for a patient
   * 
   * @param {number} patientId - Patient user ID
   * @param {Object} options - Query options
   * @param {string} options.status - Filter by status
   * @param {string} options.dateFrom - Filter from date
   * @param {string} options.dateTo - Filter to date
   * @returns {Promise<Array>} List of appointments
   * 
   * Requirement 5.1: Retrieve all appointments for patient
   */
  async getPatientAppointments(patientId, options = {}) {
    try {
      let query = `
        SELECT 
          a.id,
          a.patient_id,
          a.doctor_id,
          a.appointment_date,
          a.time_slot,
          a.qr_code_token,
          a.booking_code,
          a.status,
          a.created_at,
          a.symptoms,
          a.consultation_fee,
          a.payment_method,
          a.payment_status,
          a.checked_in_at,
          a.exam_type,
          a.insurance_number,
          DATE_FORMAT(a.insurance_expiry, '%Y-%m-%d') AS insurance_expiry,
          a.hold_expires_at,
          TIMESTAMPDIFF(SECOND, NOW(), a.hold_expires_at) AS hold_seconds_left,
          du.fullname as doctor_name,
          d.degree as doctor_degree,
          dep.name as department_name,
          dep.id as department_id
        FROM appointments a
        JOIN doctors d ON a.doctor_id = d.id
        JOIN users du ON d.user_id = du.id
        JOIN departments dep ON d.department_id = dep.id
        WHERE a.patient_id = ?
      `;

      const params = [patientId];

      // Add status filter
      if (options.status) {
        query += ' AND a.status = ?';
        params.push(options.status);
      }

      // Add date range filter
      if (options.dateFrom) {
        query += ' AND a.appointment_date >= ?';
        params.push(options.dateFrom);
      }

      if (options.dateTo) {
        query += ' AND a.appointment_date <= ?';
        params.push(options.dateTo);
      }

      query += ' ORDER BY a.appointment_date DESC, a.time_slot DESC';

      const [results] = await db.pool.execute(query, params);

      // Generate QR codes for booked appointments
      const appointmentsWithQR = await Promise.all(
        results.map(async (appointment) => {
          if (appointment.status === 'booked') {
            const qrCodeImage = await qrService.generateQRCode(appointment.qr_code_token);
            return { ...appointment, qr_code: qrCodeImage };
          }
          return appointment;
        })
      );

      return appointmentsWithQR;
    } catch (error) {
      console.error('Error getting patient appointments:', error);
      throw new Error('Failed to retrieve patient appointments');
    }
  }

  /**
   * Validate appointment ownership
   * 
   * @param {number} appointmentId - Appointment ID
   * @param {number} patientId - Patient user ID
   * @returns {Promise<boolean>} True if patient owns appointment
   * 
   * Requirement 6.5, 7.6: Verify patient owns appointment
   */
  async validateAppointmentOwnership(appointmentId, patientId) {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM appointments
        WHERE id = ? AND patient_id = ?
      `;

      const [results] = await db.pool.execute(query, [appointmentId, patientId]);
      
      return results[0].count > 0;
    } catch (error) {
      console.error('Error validating appointment ownership:', error);
      throw new Error('Failed to validate appointment ownership');
    }
  }

  /**
   * Update appointment status with validation
   * 
   * @param {number} id - Appointment ID
   * @param {string} newStatus - New status
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Updated appointment
   * 
   * Requirement 3.6, 6.1, 9.4: Update status with validation
   */
  async updateAppointmentStatus(id, newStatus, options = {}) {
    try {
      // Get current appointment
      const appointment = await this.getAppointmentById(id);
      
      if (!appointment) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }

      // Validate status transition
      const validTransitions = {
        'booked': ['checked_in', 'cancelled'],
        'checked_in': ['completed'],
        'completed': [],
        'cancelled': []
      };

      const allowedStatuses = validTransitions[appointment.status] || [];
      
      if (!allowedStatuses.includes(newStatus)) {
        throw new Error(`INVALID_STATUS_TRANSITION: Cannot change from ${appointment.status} to ${newStatus}`);
      }

      // Update status
      // Record the real arrival time so the doctor's queue is ordered by check-in, not booking time
      const updateQuery = newStatus === 'checked_in'
        ? 'UPDATE appointments SET status = ?, checked_in_at = NOW() WHERE id = ?'
        : 'UPDATE appointments SET status = ? WHERE id = ?';

      await db.pool.execute(updateQuery, [newStatus, id]);

      // Return updated appointment
      return await this.getAppointmentById(id);
    } catch (error) {
      console.error('Error updating appointment status:', error);
      throw error;
    }
  }

  /**
   * Cancel an appointment
   * 
   * @param {number} appointmentId - Appointment ID
   * @param {number} patientId - Patient user ID (for ownership validation)
   * @returns {Promise<Object>} Updated appointment
   * 
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async cancelAppointment(appointmentId, patientId) {
    try {
      // Validate ownership
      const ownsAppointment = await this.validateAppointmentOwnership(appointmentId, patientId);
      
      if (!ownsAppointment) {
        throw new Error('UNAUTHORIZED: You do not own this appointment');
      }

      // Get appointment details
      const appointment = await this.getAppointmentById(appointmentId);
      
      if (!appointment) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }

      // Check if status is booked
      if (appointment.status !== 'booked') {
        throw new Error(`CANNOT_CANCEL: Appointment with status '${appointment.status}' cannot be cancelled`);
      }

      // Check if appointment is in the future or today
      const appointmentDate = new Date(appointment.appointment_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      appointmentDate.setHours(0, 0, 0, 0);

      if (appointmentDate < today) {
        throw new Error('CANNOT_CANCEL: Cannot cancel past appointments');
      }

      // Update status to cancelled
      return await this.updateAppointmentStatus(appointmentId, 'cancelled');
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      throw error;
    }
  }

  /**
   * Reschedule an appointment
   * 
   * @param {number} appointmentId - Appointment ID
   * @param {number} patientId - Patient user ID
   * @param {Object} newSchedule - New schedule details
   * @param {string} newSchedule.appointmentDate - New date
   * @param {string} newSchedule.timeSlot - New time slot
   * @returns {Promise<Object>} Updated appointment
   * 
   * Requirements: 7.1-7.7
   */
  async rescheduleAppointment(appointmentId, patientId, newSchedule) {
    const { appointmentDate, timeSlot } = newSchedule;

    return await db.transaction(async (connection) => {
      // 1. Validate ownership
      const [ownershipCheck] = await connection.execute(
        "SELECT patient_id, doctor_id, status, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS ymd FROM appointments WHERE id = ? FOR UPDATE",
        [appointmentId]
      );

      if (ownershipCheck.length === 0) {
        throw new Error('APPOINTMENT_NOT_FOUND');
      }

      const appointment = ownershipCheck[0];

      if (appointment.patient_id !== patientId) {
        throw new Error('UNAUTHORIZED: You do not own this appointment');
      }

      // 2. Check if status is booked
      if (appointment.status !== 'booked') {
        throw new Error(`CANNOT_RESCHEDULE: Appointment with status '${appointment.status}' cannot be rescheduled`);
      }

      // 3a. The new day must be open for this doctor
      const block = await this.getDayBlock(appointment.doctor_id, appointmentDate, connection);
      if (block) {
        throw new Error(block.code);
      }
      await shiftService.assertSlotInShift(appointment.doctor_id, appointmentDate, timeSlot, connection);

      // 3. Check new slot availability
      const [slotCheck] = await connection.execute(
        `SELECT COUNT(*) as count,
                SUM(patient_id = ?) as mine
         FROM appointments
         WHERE doctor_id = ?
           AND appointment_date = ?
           AND time_slot = ?
           AND status IN ('booked', 'checked_in')
           AND id != ?
         FOR UPDATE`,
        [patientId, appointment.doctor_id, appointmentDate, timeSlot, appointmentId]
      );

      if (Number(slotCheck[0].mine) > 0) {
        throw new Error('DUPLICATE_BOOKING');
      }
      if (slotCheck[0].count >= SLOT_CAPACITY) {
        throw new Error('SLOT_NOT_AVAILABLE');
      }

      // 4. Update appointment
      await connection.execute(
        `UPDATE appointments
         SET appointment_date = ?, time_slot = ?
         WHERE id = ?`,
        [appointmentDate, timeSlot, appointmentId]
      );
      // The code carries the exam day: moving to another day gives a new number for that day
      if (String(appointmentDate).slice(0, 10) !== appointment.ymd) {
        await assignBookingCode(connection, appointmentId, appointment.doctor_id, appointmentDate);
      }

      // 5. Fetch updated appointment
      const [updatedResults] = await connection.execute(
        `SELECT 
           a.id,
           a.patient_id,
           a.doctor_id,
           a.appointment_date,
           a.time_slot,
           a.qr_code_token,
           a.booking_code,
           a.status,
           a.created_at,
           u.fullname as patient_name,
           du.fullname as doctor_name,
           dep.name as department_name
         FROM appointments a
         JOIN users u ON a.patient_id = u.id
         JOIN doctors d ON a.doctor_id = d.id
         JOIN users du ON d.user_id = du.id
         JOIN departments dep ON d.department_id = dep.id
         WHERE a.id = ?`,
        [appointmentId]
      );

      const updatedAppointment = updatedResults[0];

      // 6. Generate QR code
      const qrCodeImage = await qrService.generateQRCode(updatedAppointment.qr_code_token);
      updatedAppointment.qr_code = qrCodeImage;

      return updatedAppointment;
    });
  }

  /**
   * Get available time slots for a doctor on a specific date
   * 
   * @param {number} doctorId - Doctor ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Promise<Array>} List of available slots
   * 
   * Requirement 2.1: Display all time slots with availability status
   */
  async getAvailableSlots(doctorId, date) {
    try {
      // Define clinic working hours and slot duration
      // 08:00–12:00 and 14:00–17:00, or all day with CLINIC_OPEN_24H=1 (see config/booking.js)
      const slots = require('../config/booking').TIME_SLOTS;

      // How many patients already hold each slot
      const query = `
        SELECT time_slot, COUNT(*) AS taken
        FROM appointments
        WHERE doctor_id = ?
          AND appointment_date = ?
          AND status IN ('booked', 'checked_in')
        GROUP BY time_slot
      `;

      const [bookedSlots] = await db.pool.execute(query, [doctorId, date]);
      const dayBlock = await this.getDayBlock(doctorId, date);
      const shiftWindows = await shiftService.getWindows(doctorId, date);
      const takenBySlot = {};
      bookedSlots.forEach((row) => { takenBySlot[row.time_slot] = Number(row.taken); });

      // Check if date is today to filter past time slots
      const selectedDate = new Date(date);
      const today = new Date();
      const isToday = selectedDate.toDateString() === today.toDateString();

      // Mark availability
      const availableSlots = slots.filter((slot) => shiftService.slotInWindows(slot, shiftWindows)).map(slot => {
        const taken = takenBySlot[slot] || 0;
        const isFull = taken >= SLOT_CAPACITY;
        let isPast = false;

        if (isToday) {
          // bookable until the slot ends (walk-ins during the running slot)
          isPast = isSlotOver(date, slot, today);
        }

        return {
          time_slot: slot,
          available: !isFull && !isPast && !dayBlock,
          closed: !!dayBlock,
          booked: isFull, // kept for older clients: true means "no place left"
          full: isFull,
          taken,
          capacity: SLOT_CAPACITY,
          remaining: Math.max(SLOT_CAPACITY - taken, 0),
          past: isPast
        };
      });

      return availableSlots;
    } catch (error) {
      console.error('Error getting available slots:', error);
      throw new Error('Failed to retrieve available slots');
    }
  }
}

// Export singleton instance
module.exports = new AppointmentService();
