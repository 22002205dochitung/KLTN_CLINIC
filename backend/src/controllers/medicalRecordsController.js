const mysql = require('mysql2/promise');
require('dotenv').config();

// Tạo kết nối database với promise
// shared connection pool (one place for SSL, SQL mode and connection limits)
const { pool: db } = require('../config/database');

/**
 * Medical Records Controller
 * Handles all medical records operations for doctors, patients, and receptionists
 */

/**
 * A doctor may READ a record when they wrote it, or when the patient has (or had) an
 * appointment with them – a treating doctor needs the patient's history.
 * Write operations still require that the doctor owns the appointment.
 */
const doctorTreatsPatient = async (doctorId, record) => {
    if (doctorId === record.doctor_id) return true;
    const [rows] = await db.query(
        'SELECT 1 FROM appointments WHERE doctor_id = ? AND patient_id = ? LIMIT 1',
        [doctorId, record.patient_id]
    );
    return rows.length > 0;
};

/**
 * Get Checked-In Patients for Doctor
 * Returns list of patients who have checked-in and are waiting for examination
 * 
 * Route: GET /api/medical-records/checked-in
 * Auth: Doctor only
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
const getCheckedInPatients = async (req, res) => {
    try {
        // Extract doctor_id from authenticated user
        const doctorId = req.user.id; // This is the user_id, need to get doctor.id
        
        // Get doctor.id from user_id
        const [doctorRecord] = await db.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [doctorId]
        );
        
        if (doctorRecord.length === 0) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_A_DOCTOR',
                    message: 'User is not registered as a doctor'
                }
            });
        }
        
        const doctor_id = doctorRecord[0].id;
        
        // Query checked-in appointments for today
        const [appointments] = await db.query(`
            SELECT 
                a.id as appointment_id,
                a.appointment_date,
                a.time_slot,
                a.symptoms,
                a.status,
                u.id as patient_id,
                u.fullname as patient_fullname,
                u.phone as patient_phone,
                dept.name as department_name
            FROM appointments a
            JOIN users u ON a.patient_id = u.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN departments dept ON d.department_id = dept.id
            WHERE a.doctor_id = ?
                AND a.status = 'checked_in'
                AND a.appointment_date = CURDATE()
            ORDER BY a.time_slot ASC
        `, [doctor_id]);
        
        res.json({
            success: true,
            data: {
                appointments,
                count: appointments.length
            }
        });
        
    } catch (error) {
        console.error('Get checked-in patients error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi lấy danh sách bệnh nhân'
            }
        });
    }
};

/**
 * Create Medical Record
 * Creates a new medical record for a checked-in appointment
 * 
 * Route: POST /api/medical-records
 * Auth: Doctor only
 * Requirements: 2.1, 2.2, 2.3, 2.4, 10.3, 11.2, 11.3
 */
const createMedicalRecord = async (req, res) => {
    try {
        const { appointment_id, symptoms, diagnosis, note, reexamination_date } = req.body;
        const doctorUserId = req.user.id;
        
        // Validation: Check required fields
        if (!appointment_id) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_FIELDS',
                    message: 'appointment_id là bắt buộc'
                }
            });
        }
        
        // Get doctor.id from user_id
        const [doctorRecord] = await db.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [doctorUserId]
        );
        
        if (doctorRecord.length === 0) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_A_DOCTOR',
                    message: 'User is not registered as a doctor'
                }
            });
        }
        
        const doctor_id = doctorRecord[0].id;
        
        // Check if appointment exists and get its details
        const [appointments] = await db.query(
            'SELECT * FROM appointments WHERE id = ?',
            [appointment_id]
        );
        
        if (appointments.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'APPOINTMENT_NOT_FOUND',
                    message: 'Không tìm thấy lịch hẹn'
                }
            });
        }
        
        const appointment = appointments[0];
        
        // Authorization: Verify doctor owns this appointment
        if (appointment.doctor_id !== doctor_id) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_AUTHORIZED',
                    message: 'Bạn không có quyền tạo hồ sơ cho lịch hẹn này'
                }
            });
        }
        
        // Validation: Check appointment is in checked_in status
        if (appointment.status !== 'checked_in') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_STATUS',
                    message: 'Lịch hẹn phải ở trạng thái "checked_in" để tạo hồ sơ'
                }
            });
        }
        
        // Validation: Check reexamination_date is future date or null
        if (reexamination_date) {
            const reexamDate = new Date(reexamination_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (reexamDate < today) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_DATE',
                        message: 'Ngày tái khám phải là ngày trong tương lai'
                    }
                });
            }
        }
        
        // Check if medical record already exists (UNIQUE constraint check)
        const [existingRecords] = await db.query(
            'SELECT id FROM medical_records WHERE appointment_id = ?',
            [appointment_id]
        );
        
        if (existingRecords.length > 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'DUPLICATE_RECORD',
                    message: 'Hồ sơ khám bệnh đã tồn tại cho lịch hẹn này'
                }
            });
        }
        
        // Insert medical record
        const [result] = await db.query(
            `INSERT INTO medical_records 
             (appointment_id, symptoms, diagnosis, note, reexamination_date, created_at) 
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [
                appointment_id,
                symptoms || appointment.symptoms, // Pre-fill from appointment if not provided
                diagnosis,
                note,
                reexamination_date || null
            ]
        );
        
        res.status(201).json({
            success: true,
            data: {
                medicalRecord: {
                    id: result.insertId,
                    appointment_id,
                    symptoms: symptoms || appointment.symptoms,
                    diagnosis,
                    note,
                    reexamination_date: reexamination_date || null,
                    created_at: new Date()
                }
            },
            message: 'Tạo hồ sơ khám bệnh thành công'
        });
        
    } catch (error) {
        console.error('Create medical record error:', error);
        
        // Handle specific database errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'DUPLICATE_RECORD',
                    message: 'Hồ sơ khám bệnh đã tồn tại cho lịch hẹn này'
                }
            });
        }
        
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi tạo hồ sơ khám bệnh'
            }
        });
    }
};

/**
 * Create Prescriptions
 * Creates multiple prescriptions for a medical record
 * 
 * Route: POST /api/medical-records/:id/prescriptions
 * Auth: Doctor only
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.3
 */
const createPrescriptions = async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        const medical_record_id = parseInt(req.params.id);
        const { prescriptions } = req.body;
        const doctorUserId = req.user.id;
        
        // Validation: Check prescriptions array exists
        if (!prescriptions || !Array.isArray(prescriptions) || prescriptions.length === 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_FIELDS',
                    message: 'Danh sách đơn thuốc là bắt buộc và không được rỗng'
                }
            });
        }
        
        // Get doctor.id from user_id
        const [doctorRecord] = await connection.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [doctorUserId]
        );
        
        if (doctorRecord.length === 0) {
            connection.release();
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_A_DOCTOR',
                    message: 'User is not registered as a doctor'
                }
            });
        }
        
        const doctor_id = doctorRecord[0].id;
        
        // Check if medical record exists and belongs to this doctor
        const [medicalRecords] = await connection.query(`
            SELECT mr.*, a.doctor_id
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            WHERE mr.id = ?
        `, [medical_record_id]);
        
        if (medicalRecords.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                error: {
                    code: 'MEDICAL_RECORD_NOT_FOUND',
                    message: 'Không tìm thấy hồ sơ khám bệnh'
                }
            });
        }
        
        // Authorization: Verify doctor owns this medical record
        if (medicalRecords[0].doctor_id !== doctor_id) {
            connection.release();
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_AUTHORIZED',
                    message: 'Bạn không có quyền kê đơn cho hồ sơ này'
                }
            });
        }
        
        // Validate each prescription
        for (let i = 0; i < prescriptions.length; i++) {
            const prescription = prescriptions[i];
            
            if (!prescription.medicine_name || prescription.medicine_name.trim() === '') {
                connection.release();
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'EMPTY_MEDICINE_NAME',
                        message: `Tên thuốc không được để trống (đơn thuốc thứ ${i + 1})`
                    }
                });
            }
            
            if (!prescription.quantity || prescription.quantity <= 0) {
                connection.release();
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_QUANTITY',
                        message: `Số lượng thuốc phải lớn hơn 0 (đơn thuốc thứ ${i + 1})`
                    }
                });
            }
        }
        
        // Catalogue items: name/unit/price come from the medicine list (price is a snapshot,
        // so later price changes do not alter this bill). Free-text items stay untracked.
        const catalogueIds = [...new Set(prescriptions
            .map(p => parseInt(p.medicine_id, 10))
            .filter(id => Number.isInteger(id) && id > 0))];
        const catalogue = new Map();
        if (catalogueIds.length > 0) {
            const [meds] = await connection.query(
                `SELECT id, name, unit, price, stock, active FROM medicines WHERE id IN (${catalogueIds.map(() => '?').join(',')})`,
                catalogueIds
            );
            meds.forEach(m => catalogue.set(m.id, m));
            const missing = catalogueIds.find(id => !catalogue.has(id) || !catalogue.get(id).active);
            if (missing) {
                connection.release();
                return res.status(400).json({
                    success: false,
                    error: { code: 'MEDICINE_NOT_AVAILABLE', message: 'Có thuốc không còn trong danh mục – vui lòng chọn lại' }
                });
            }
        }

        // Start transaction
        await connection.beginTransaction();
        
        // Insert prescriptions
        const createdIds = [];
        const warnings = [];
        const requested = new Map(); // medicine_id -> total quantity in this prescription
        for (const prescription of prescriptions) {
            const med = catalogue.get(parseInt(prescription.medicine_id, 10)) || null;
            const quantity = parseInt(prescription.quantity, 10);
            const [result] = await connection.query(
                `INSERT INTO prescriptions 
                 (medical_record_id, medicine_id, medicine_name, dosage, quantity, unit, instructions, unit_price) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    medical_record_id,
                    med ? med.id : null,
                    med ? med.name : prescription.medicine_name.trim(),
                    prescription.dosage || '',
                    quantity,
                    med ? med.unit : (String(prescription.unit || '').trim().slice(0, 30) || null),
                    prescription.instructions || '',
                    med ? med.price : null
                ]
            );
            createdIds.push(result.insertId);
            if (med) requested.set(med.id, (requested.get(med.id) || 0) + quantity);
        }
        requested.forEach((qty, id) => {
            const med = catalogue.get(id);
            if (qty > Number(med.stock)) {
                warnings.push(`${med.name}: kê ${qty} ${med.unit} nhưng kho chỉ còn ${med.stock}`);
            }
        });
        
        await connection.commit();
        connection.release();
        
        res.status(201).json({
            success: true,
            data: {
                prescriptionIds: createdIds,
                count: createdIds.length,
                warnings
            },
            message: warnings.length
                ? `Kê đơn thuốc thành công. Lưu ý kho: ${warnings.join('; ')}`
                : 'Kê đơn thuốc thành công'
        });
        
    } catch (error) {
        await connection.rollback();
        connection.release();
        
        console.error('Create prescriptions error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi kê đơn thuốc'
            }
        });
    }
};

/**
 * Update Reexamination Date
 * Updates the reexamination date for a medical record
 * 
 * Route: PUT /api/medical-records/:id/reexamination
 * Auth: Doctor only
 * Requirements: 4.1, 4.2, 4.3, 4.4, 10.3
 */
const updateReexaminationDate = async (req, res) => {
    try {
        const medical_record_id = parseInt(req.params.id);
        const { reexamination_date } = req.body;
        const doctorUserId = req.user.id;
        
        // Get doctor.id from user_id
        const [doctorRecord] = await db.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [doctorUserId]
        );
        
        if (doctorRecord.length === 0) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_A_DOCTOR',
                    message: 'User is not registered as a doctor'
                }
            });
        }
        
        const doctor_id = doctorRecord[0].id;
        
        // Check if medical record exists and belongs to this doctor
        const [medicalRecords] = await db.query(`
            SELECT mr.*, a.doctor_id
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            WHERE mr.id = ?
        `, [medical_record_id]);
        
        if (medicalRecords.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'MEDICAL_RECORD_NOT_FOUND',
                    message: 'Không tìm thấy hồ sơ khám bệnh'
                }
            });
        }
        
        // Authorization: Verify doctor owns this medical record
        if (medicalRecords[0].doctor_id !== doctor_id) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_AUTHORIZED',
                    message: 'Bạn không có quyền cập nhật hồ sơ này'
                }
            });
        }
        
        // Validation: Check reexamination_date is future date or null
        if (reexamination_date !== null && reexamination_date !== undefined) {
            const reexamDate = new Date(reexamination_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (reexamDate < today) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_DATE',
                        message: 'Ngày tái khám phải là ngày trong tương lai'
                    }
                });
            }
        }
        
        // Update reexamination date
        await db.query(
            'UPDATE medical_records SET reexamination_date = ? WHERE id = ?',
            [reexamination_date || null, medical_record_id]
        );
        
        // Get updated record
        const [updatedRecord] = await db.query(
            'SELECT * FROM medical_records WHERE id = ?',
            [medical_record_id]
        );
        
        res.json({
            success: true,
            data: {
                medicalRecord: updatedRecord[0]
            },
            message: 'Cập nhật ngày tái khám thành công'
        });
        
    } catch (error) {
        console.error('Update reexamination date error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi cập nhật ngày tái khám'
            }
        });
    }
};

/**
 * Complete Appointment
 * Updates appointment status from checked_in to completed
 * 
 * Route: PUT /api/appointments/:id/complete (added to appointmentRoutes)
 * Auth: Doctor only
 * Requirements: 5.1, 5.2, 5.3, 5.4, 10.3
 */
const completeAppointment = async (req, res) => {
    try {
        const appointment_id = parseInt(req.params.id);
        const doctorUserId = req.user.id;
        
        // Get doctor.id from user_id
        const [doctorRecord] = await db.query(
            'SELECT id FROM doctors WHERE user_id = ?',
            [doctorUserId]
        );
        
        if (doctorRecord.length === 0) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_A_DOCTOR',
                    message: 'User is not registered as a doctor'
                }
            });
        }
        
        const doctor_id = doctorRecord[0].id;
        
        // Check if appointment exists
        const [appointments] = await db.query(
            'SELECT * FROM appointments WHERE id = ?',
            [appointment_id]
        );
        
        if (appointments.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'APPOINTMENT_NOT_FOUND',
                    message: 'Không tìm thấy lịch hẹn'
                }
            });
        }
        
        const appointment = appointments[0];
        
        // Authorization: Verify doctor owns this appointment
        if (appointment.doctor_id !== doctor_id) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'NOT_AUTHORIZED',
                    message: 'Bạn không có quyền hoàn thành lịch hẹn này'
                }
            });
        }
        
        // Validation: Check appointment status is checked_in
        if (appointment.status !== 'checked_in') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_STATUS',
                    message: 'Chỉ có thể hoàn thành lịch hẹn đang ở trạng thái "checked_in"'
                }
            });
        }
        
        // Validation: Check medical record exists
        const [medicalRecords] = await db.query(
            'SELECT id FROM medical_records WHERE appointment_id = ?',
            [appointment_id]
        );
        
        if (medicalRecords.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'NO_MEDICAL_RECORD',
                    message: 'Phải tạo hồ sơ khám bệnh trước khi hoàn thành lịch hẹn'
                }
            });
        }
        
        // Update appointment status to completed
        await db.query(
            'UPDATE appointments SET status = ? WHERE id = ?',
            ['completed', appointment_id]
        );
        
        res.json({
            success: true,
            data: {
                appointment: {
                    id: appointment_id,
                    status: 'completed',
                    completed_at: new Date()
                }
            },
            message: 'Hoàn thành lịch khám thành công'
        });
        
    } catch (error) {
        console.error('Complete appointment error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi hoàn thành lịch khám'
            }
        });
    }
};

/**
 * Get Patient Medical History
 * Returns all medical records for authenticated patient
 * 
 * Route: GET /api/medical-records/patient/history
 * Auth: Patient only
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 10.2
 */
const getPatientMedicalHistory = async (req, res) => {
    try {
        const patient_id = req.user.id; // user_id of the patient

        // Query medical records for this patient
        const [records] = await db.query(`
            SELECT
                mr.id as medical_record_id,
                mr.symptoms,
                mr.diagnosis,
                mr.note,
                mr.reexamination_date,
                DATE_FORMAT(mr.reexamination_date, '%Y-%m-%d') as reexamination_ymd,
                mr.created_at,
                a.appointment_date,
                a.time_slot,
                d.id as doctor_id,
                dept.id as department_id,
                u.fullname as doctor_fullname,
                dept.name as department_name
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users u ON d.user_id = u.id
            JOIN departments dept ON d.department_id = dept.id
            WHERE a.patient_id = ?
                AND a.status = 'completed'
            ORDER BY a.appointment_date DESC
        `, [patient_id]);
        
        res.json({
            success: true,
            data: {
                records,
                count: records.length
            }
        });
        
    } catch (error) {
        console.error('Get patient medical history error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi lấy lịch sử khám bệnh'
            }
        });
    }
};

/**
 * Get Medical Record Details
 * Returns detailed information about a specific medical record
 * Authorization: Patient (own records), Doctor (own records), Receptionist (any)
 * 
 * Route: GET /api/medical-records/:id
 * Auth: Authenticated users with role-based access
 * Requirements: 7.1, 7.2, 7.3, 7.4, 10.2, 10.3
 */
const getMedicalRecordDetails = async (req, res) => {
    try {
        const medical_record_id = parseInt(req.params.id);
        const userId = req.user.id;
        const userRole = req.user.role;
        
        // Query medical record with appointment details
        const [records] = await db.query(`
            SELECT 
                mr.id as medical_record_id,
                mr.symptoms,
                mr.diagnosis,
                mr.note,
                mr.reexamination_date,
                mr.created_at,
                a.id as appointment_id,
                a.appointment_date,
                a.time_slot,
                a.patient_id,
                a.doctor_id,
                patient_user.fullname as patient_fullname,
                patient_user.phone as patient_phone,
                patient_user.date_of_birth as patient_dob,
                patient_user.gender as patient_gender,
                patient_user.allergies as patient_allergies,
                a.exam_type,
                a.insurance_number,
                doctor_user.fullname as doctor_fullname,
                d.degree as doctor_degree,
                d.room as doctor_room,
                dept.name as department_name
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            JOIN users patient_user ON a.patient_id = patient_user.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users doctor_user ON d.user_id = doctor_user.id
            JOIN departments dept ON d.department_id = dept.id
            WHERE mr.id = ?
        `, [medical_record_id]);
        
        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'MEDICAL_RECORD_NOT_FOUND',
                    message: 'Không tìm thấy hồ sơ khám bệnh'
                }
            });
        }
        
        const record = records[0];
        
        // Authorization check based on role
        if (userRole === 'patient') {
            // Patient can only view their own records
            if (record.patient_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'NOT_AUTHORIZED',
                        message: 'Bạn không có quyền xem hồ sơ này'
                    }
                });
            }
        } else if (userRole === 'doctor') {
            // Doctor can only view their own patient records
            const [doctorRecord] = await db.query(
                'SELECT id FROM doctors WHERE user_id = ?',
                [userId]
            );
            
            if (doctorRecord.length === 0 || !(await doctorTreatsPatient(doctorRecord[0].id, record))) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'NOT_AUTHORIZED',
                        message: 'Bạn không có quyền xem hồ sơ này'
                    }
                });
            }
        } else if (userRole === 'receptionist' || userRole === 'admin') {
            // Front desk and admin can view any record
        } else {
            // Other roles not allowed
            return res.status(403).json({
                success: false,
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Bạn không có quyền truy cập hồ sơ khám bệnh'
                }
            });
        }
        
        res.json({
            success: true,
            data: {
                record
            }
        });
        
    } catch (error) {
        console.error('Get medical record details error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi lấy chi tiết hồ sơ'
            }
        });
    }
};

/**
 * Get Prescriptions for Medical Record
 * Returns all prescriptions for a specific medical record
 * Authorization: Same as getMedicalRecordDetails
 * 
 * Route: GET /api/medical-records/:id/prescriptions
 * Auth: Authenticated users with role-based access
 * Requirements: 8.1, 8.2, 8.3, 8.4, 10.2, 10.3
 */
const getPrescriptions = async (req, res) => {
    try {
        const medical_record_id = parseInt(req.params.id);
        const userId = req.user.id;
        const userRole = req.user.role;
        
        // First check if medical record exists and get authorization info
        const [records] = await db.query(`
            SELECT 
                mr.id,
                a.patient_id,
                a.doctor_id
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            WHERE mr.id = ?
        `, [medical_record_id]);
        
        if (records.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'MEDICAL_RECORD_NOT_FOUND',
                    message: 'Không tìm thấy hồ sơ khám bệnh'
                }
            });
        }
        
        const record = records[0];
        
        // Authorization check based on role (same as getMedicalRecordDetails)
        if (userRole === 'patient') {
            if (record.patient_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'NOT_AUTHORIZED',
                        message: 'Bạn không có quyền xem đơn thuốc này'
                    }
                });
            }
        } else if (userRole === 'doctor') {
            const [doctorRecord] = await db.query(
                'SELECT id FROM doctors WHERE user_id = ?',
                [userId]
            );
            
            if (doctorRecord.length === 0 || !(await doctorTreatsPatient(doctorRecord[0].id, record))) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'NOT_AUTHORIZED',
                        message: 'Bạn không có quyền xem đơn thuốc này'
                    }
                });
            }
        } else if (userRole === 'receptionist' || userRole === 'admin') {
            // Front desk and admin can view any prescriptions
        } else {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'INSUFFICIENT_PERMISSIONS',
                    message: 'Bạn không có quyền truy cập đơn thuốc'
                }
            });
        }
        
        // Get prescriptions
        const [prescriptions] = await db.query(`
            SELECT 
                id as prescription_id,
                medicine_name,
                dosage,
                quantity,
                unit,
                instructions
            FROM prescriptions
            WHERE medical_record_id = ?
            ORDER BY id ASC
        `, [medical_record_id]);
        
        res.json({
            success: true,
            data: {
                prescriptions,
                count: prescriptions.length
            }
        });
        
    } catch (error) {
        console.error('Get prescriptions error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi lấy đơn thuốc'
            }
        });
    }
};

/**
 * Get Patient Records by Receptionist
 * Returns all medical records for a specific patient (receptionist access only)
 * 
 * Route: GET /api/medical-records/patient/:patientId
 * Auth: Receptionist only
 * Requirements: 9.1, 9.2, 9.3, 9.4, 10.4
 */
const getPatientRecordsByReceptionist = async (req, res) => {
    try {
        const patient_id = parseInt(req.params.patientId);
        
        // Check if patient exists
        const [patients] = await db.query(
            'SELECT id FROM users WHERE id = ? AND role = ?',
            [patient_id, 'patient']
        );
        
        if (patients.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'PATIENT_NOT_FOUND',
                    message: 'Không tìm thấy bệnh nhân'
                }
            });
        }
        
        // Query medical records for this patient
        const [records] = await db.query(`
            SELECT 
                mr.id as medical_record_id,
                mr.symptoms,
                mr.diagnosis,
                mr.note,
                mr.reexamination_date,
                mr.created_at,
                a.appointment_date,
                a.time_slot,
                u.fullname as doctor_fullname,
                dept.name as department_name
            FROM medical_records mr
            JOIN appointments a ON mr.appointment_id = a.id
            JOIN doctors d ON a.doctor_id = d.id
            JOIN users u ON d.user_id = u.id
            LEFT JOIN departments dept ON d.department_id = dept.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_date DESC
        `, [patient_id]);
        
        res.json({
            success: true,
            data: {
                patientId: patient_id,
                records,
                count: records.length
            }
        });
        
    } catch (error) {
        console.error('Get patient records by receptionist error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Lỗi server khi lấy hồ sơ bệnh nhân'
            }
        });
    }
};

/**
 * Doctor's patients who were asked to come back (follow-up / tái khám)
 *
 * Route: GET /api/medical-records/doctor/follow-ups?days=30
 * Auth: Doctor only
 *
 * Re-exam dates from 30 days ago up to `days` ahead (1-90, default 30). A follow-up counts as
 * booked only when the patient booked this doctor AFTER the visit that set the re-exam date
 * (same rule as the patient dashboard), so older bookings are not mistaken for it.
 */
const getDoctorFollowUps = async (req, res) => {
    try {
        const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);

        const [doctorRecord] = await db.query('SELECT id FROM doctors WHERE user_id = ?', [req.user.id]);
        if (doctorRecord.length === 0) {
            return res.status(403).json({
                success: false,
                error: { code: 'NOT_A_DOCTOR', message: 'Tài khoản chưa được gán hồ sơ bác sĩ' }
            });
        }
        const doctorId = doctorRecord[0].id;

        const [rows] = await db.query(`
            SELECT
                mr.id AS medical_record_id,
                DATE_FORMAT(mr.reexamination_date, '%Y-%m-%d') AS reexamination_ymd,
                mr.diagnosis,
                mr.created_at AS record_created_at,
                a.id AS visit_appointment_id,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS visit_date,
                p.id AS patient_id,
                p.fullname AS patient_name,
                p.phone AS patient_phone,
                (SELECT b.id FROM appointments b
                  WHERE b.patient_id = a.patient_id
                    AND b.doctor_id = a.doctor_id
                    AND b.id <> a.id
                    AND b.appointment_date > a.appointment_date
                    -- attended, or still upcoming (a past 'booked' one is a no-show)
                    AND (b.status = 'completed'
                         OR (b.status IN ('booked', 'checked_in') AND b.appointment_date >= CURDATE()))
                    AND b.created_at >= mr.created_at
                  ORDER BY b.appointment_date ASC, b.time_slot ASC
                  LIMIT 1) AS followup_appointment_id
            FROM medical_records mr
            JOIN appointments a ON a.id = mr.appointment_id
            JOIN users p ON p.id = a.patient_id
            WHERE a.doctor_id = ?
              AND mr.reexamination_date IS NOT NULL
              AND mr.reexamination_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                                            AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
            ORDER BY mr.reexamination_date ASC, p.fullname ASC
        `, [doctorId, days]);

        // Details of the follow-up bookings found above
        const followupIds = rows.map((r) => r.followup_appointment_id).filter(Boolean);
        const followups = {};
        if (followupIds.length > 0) {
            const [fRows] = await db.query(
                `SELECT id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date, time_slot, status
                 FROM appointments WHERE id IN (${followupIds.map(() => '?').join(',')})`,
                followupIds
            );
            fRows.forEach((f) => { followups[f.id] = f; });
        }

        const [[{ today }]] = await db.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

        const items = rows.map((r) => {
            const f = r.followup_appointment_id ? followups[r.followup_appointment_id] : null;
            let state;
            if (f && f.status === 'completed') state = 'done';
            else if (f) state = 'booked';
            else if (r.reexamination_ymd < today) state = 'overdue';
            else state = 'pending';
            return {
                medical_record_id: r.medical_record_id,
                reexamination_date: r.reexamination_ymd,
                diagnosis: r.diagnosis,
                visit_date: r.visit_date,
                patient_id: r.patient_id,
                patient_name: r.patient_name,
                patient_phone: r.patient_phone,
                state,
                followup: f || null
            };
        });

        const summary = { total: items.length, pending: 0, overdue: 0, booked: 0, done: 0 };
        items.forEach((i) => { summary[i.state] += 1; });

        res.json({ success: true, data: { today, days, summary, items } });
    } catch (error) {
        console.error('Get doctor follow-ups error:', error);
        res.status(500).json({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Không thể tải danh sách hẹn tái khám' }
        });
    }
};

module.exports = {
    getDoctorFollowUps,
    getCheckedInPatients,
    createMedicalRecord,
    createPrescriptions,
    updateReexaminationDate,
    completeAppointment,
    getPatientMedicalHistory,
    getMedicalRecordDetails,
    getPrescriptions,
    getPatientRecordsByReceptionist
};
