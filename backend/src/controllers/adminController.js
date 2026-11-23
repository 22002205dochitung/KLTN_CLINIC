const auditLogService = require('../services/auditLogService');
const { executeQuery, queryFirst } = require('../config/database');
const paymentService = require('../services/paymentService');
const { toCsv } = require('../utils/csv');

/**
 * Admin Controller
 * Handles admin-specific operations including user management, 
 * security monitoring, department management, and doctor profile management
 * 
 * Requirements: 10.6 - Admin security dashboard, 16.1-16.7 - Department Management, 17.1-17.7 - Doctor Management
 */
class AdminController {
    // ============ DEPARTMENT MANAGEMENT ============
    
    /**
     * Get all departments with doctor counts
     * GET /api/admin/departments
     * Requirements: 16.6
     */
    async getDepartments(req, res) {
        try {
            const departments = await executeQuery(`
                SELECT 
                    d.id,
                    d.name,
                    d.description,
                    COUNT(doc.id) as doctor_count
                FROM departments d
                LEFT JOIN doctors doc ON d.id = doc.department_id
                GROUP BY d.id, d.name, d.description
                ORDER BY d.name
            `);

            res.json({
                success: true,
                data: departments
            });
        } catch (error) {
            console.error('Get departments error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy danh sách khoa'
                }
            });
        }
    }
    
    /**
     * Create a new department
     * POST /api/admin/departments
     * Body: { name, description }
     * Requirements: 16.1, 16.2
     */
    async createDepartment(req, res) {
        try {
            const { name, description } = req.body;
            
            // Validation: name is required (Requirement 16.2)
            if (!name || name.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Tên khoa không được để trống'
                    }
                });
            }
            
            // Insert department
            const result = await executeQuery(
                'INSERT INTO departments (name, description) VALUES (?, ?)',
                [name.trim(), description || null]
            );
            
            res.status(201).json({
                success: true,
                data: {
                    id: result.insertId,
                    name: name.trim(),
                    description: description || null
                },
                message: 'Tạo khoa thành công'
            });
            
        } catch (error) {
            console.error('Create department error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi tạo khoa'
                }
            });
        }
    }
    
    /**
     * Update a department
     * PUT /api/admin/departments/:id
     * Body: { name, description }
     * Requirements: 16.3
     */
    async updateDepartment(req, res) {
        try {
            const { id } = req.params;
            const { name, description } = req.body;
            
            // Validation
            if (!name || name.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Tên khoa không được để trống'
                    }
                });
            }
            
            // Check if department exists
            const department = await queryFirst(
                'SELECT id FROM departments WHERE id = ?',
                [id]
            );
            
            if (!department) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'DEPARTMENT_NOT_FOUND',
                        message: 'Không tìm thấy khoa'
                    }
                });
            }
            
            // Update department
            await executeQuery(
                'UPDATE departments SET name = ?, description = ? WHERE id = ?',
                [name.trim(), description || null, id]
            );
            
            res.json({
                success: true,
                data: {
                    id: parseInt(id),
                    name: name.trim(),
                    description: description || null
                },
                message: 'Cập nhật khoa thành công'
            });
            
        } catch (error) {
            console.error('Update department error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi cập nhật khoa'
                }
            });
        }
    }
    
    /**
     * Delete a department
     * DELETE /api/admin/departments/:id
     * Requirements: 16.4, 16.5
     */
    async deleteDepartment(req, res) {
        try {
            const { id } = req.params;
            
            // Check if department exists
            const department = await queryFirst(
                'SELECT id, name FROM departments WHERE id = ?',
                [id]
            );
            
            if (!department) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'DEPARTMENT_NOT_FOUND',
                        message: 'Không tìm thấy khoa'
                    }
                });
            }
            
            // Check if department has associated doctors (Requirement 16.5)
            const [doctorsResult] = await executeQuery(
                'SELECT COUNT(*) as count FROM doctors WHERE department_id = ?',
                [id]
            );
            
            if (doctorsResult.count > 0) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'DEPARTMENT_HAS_DOCTORS',
                        message: `Không thể xóa khoa này vì còn ${doctorsResult.count} bác sĩ được gán vào khoa`
                    }
                });
            }
            
            // Delete department
            await executeQuery('DELETE FROM departments WHERE id = ?', [id]);
            
            res.json({
                success: true,
                message: `Xóa khoa "${department.name}" thành công`
            });
            
        } catch (error) {
            console.error('Delete department error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi xóa khoa'
                }
            });
        }
    }
    
    // ============ DOCTOR MANAGEMENT ============
    
    /**
     * Get all doctors with user and department information
     * GET /api/admin/doctors
     * Requirements: 17.6
     */
    async getDoctors(req, res) {
        try {
            const doctors = await executeQuery(`
                SELECT 
                    d.id as doctor_id,
                    d.user_id,
                    d.department_id,
                    d.degree,
                    d.room,
                    d.bio,
                    d.experience_years,
                    d.expertise,
                    u.fullname,
                    u.email,
                    u.phone,
                    u.role,
                    dept.name as department_name
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN departments dept ON d.department_id = dept.id
                ORDER BY dept.name, u.fullname
            `);

            res.json({
                success: true,
                data: doctors
            });
        } catch (error) {
            console.error('Get doctors error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy danh sách bác sĩ'
                }
            });
        }
    }
    
    /**
     * Create a doctor profile
     * POST /api/admin/doctors
     * Body: { user_id, department_id, degree }
     * Requirements: 17.1, 17.2, 17.3, 17.4
     */
    async createDoctor(req, res) {
        try {
            const { user_id, department_id, degree } = req.body;
            
            // Validation
            if (!user_id) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'user_id là bắt buộc'
                    }
                });
            }
            
            // Validate user exists and has doctor role (Requirement 17.4)
            const user = await queryFirst(
                'SELECT id, fullname, email, role FROM users WHERE id = ?',
                [user_id]
            );
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'Không tìm thấy người dùng'
                    }
                });
            }
            
            if (user.role !== 'doctor') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_ROLE',
                        message: 'Người dùng phải có vai trò "doctor"'
                    }
                });
            }
            
            // Check if user already has a doctor profile
            const existingDoctor = await queryFirst(
                'SELECT id FROM doctors WHERE user_id = ?',
                [user_id]
            );
            
            if (existingDoctor) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'DOCTOR_ALREADY_EXISTS',
                        message: 'Người dùng này đã có hồ sơ bác sĩ'
                    }
                });
            }
            
            // Validate department exists if provided
            if (department_id) {
                const department = await queryFirst(
                    'SELECT id FROM departments WHERE id = ?',
                    [department_id]
                );
                
                if (!department) {
                    return res.status(404).json({
                        success: false,
                        error: {
                            code: 'DEPARTMENT_NOT_FOUND',
                            message: 'Không tìm thấy khoa'
                        }
                    });
                }
            }
            
            // Insert doctor profile
            const result = await executeQuery(
                'INSERT INTO doctors (user_id, department_id, degree) VALUES (?, ?, ?)',
                [user_id, department_id || null, degree || null]
            );
            
            res.status(201).json({
                success: true,
                data: {
                    id: result.insertId,
                    user_id,
                    department_id: department_id || null,
                    degree: degree || null,
                    fullname: user.fullname,
                    email: user.email
                },
                message: 'Tạo hồ sơ bác sĩ thành công'
            });
            
        } catch (error) {
            console.error('Create doctor error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi tạo hồ sơ bác sĩ'
                }
            });
        }
    }
    
    /**
     * Update a doctor profile
     * PUT /api/admin/doctors/:id
     * Body: { department_id, degree }
     * Requirements: 17.5
     */
    async updateDoctor(req, res) {
        try {
            const { id } = req.params;
            const { department_id, degree } = req.body;
            
            // Check if doctor exists
            const doctor = await queryFirst(
                'SELECT id, user_id FROM doctors WHERE id = ?',
                [id]
            );
            
            if (!doctor) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'DOCTOR_NOT_FOUND',
                        message: 'Không tìm thấy bác sĩ'
                    }
                });
            }
            
            // Validate department exists if provided
            if (department_id) {
                const department = await queryFirst(
                    'SELECT id FROM departments WHERE id = ?',
                    [department_id]
                );
                
                if (!department) {
                    return res.status(404).json({
                        success: false,
                        error: {
                            code: 'DEPARTMENT_NOT_FOUND',
                            message: 'Không tìm thấy khoa'
                        }
                    });
                }
            }
            
            // Public profile shown on the "Bác sĩ" page (only the fields that were sent)
            const profile = {};
            const body = req.body || {};
            if (body.room !== undefined) {
                const room = String(body.room || '').trim();
                if (room.length > 20) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Số phòng tối đa 20 ký tự' } });
                profile.room = room || null;
            }
            if (body.bio !== undefined) {
                const bio = String(body.bio || '').trim();
                if (bio.length > 2000) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Giới thiệu tối đa 2000 ký tự' } });
                profile.bio = bio || null;
            }
            if (body.experience_years !== undefined) {
                const years = body.experience_years === '' || body.experience_years === null ? null : Number(body.experience_years);
                if (years !== null && (!Number.isInteger(years) || years < 0 || years > 70)) {
                    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Số năm kinh nghiệm phải từ 0 đến 70' } });
                }
                profile.experience_years = years;
            }
            if (body.expertise !== undefined) {
                const list = (Array.isArray(body.expertise) ? body.expertise : String(body.expertise || '').split(','))
                    .map((x) => String(x).trim()).filter(Boolean);
                const text = list.join(', ');
                if (text.length > 255) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Thế mạnh chuyên môn tối đa 255 ký tự' } });
                profile.expertise = text || null;
            }

            // Update doctor profile
            const keys = Object.keys(profile);
            await executeQuery(
                `UPDATE doctors SET department_id = ?, degree = ?${keys.map((k) => `, ${k} = ?`).join('')} WHERE id = ?`,
                [department_id || null, degree || null, ...keys.map((k) => profile[k]), id]
            );
            
            // Get updated doctor info
            const updatedDoctor = await queryFirst(`
                SELECT 
                    d.id as doctor_id,
                    d.user_id,
                    d.department_id,
                    d.degree,
                    d.room,
                    d.bio,
                    d.experience_years,
                    d.expertise,
                    u.fullname,
                    u.email,
                    dept.name as department_name
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                LEFT JOIN departments dept ON d.department_id = dept.id
                WHERE d.id = ?
            `, [id]);
            
            res.json({
                success: true,
                data: updatedDoctor,
                message: 'Cập nhật hồ sơ bác sĩ thành công'
            });
            
        } catch (error) {
            console.error('Update doctor error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi cập nhật hồ sơ bác sĩ'
                }
            });
        }
    }

    /**
     * Get audit logs with pagination and filtering
     * GET /api/admin/audit-logs
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAuditLogs(req, res) {
        try {
            const {
                userId,
                action,
                eventTypes, // NEW: comma-separated list of event types to filter
                startDate,
                endDate,
                page = 1,
                limit = 50
            } = req.query;

            const filters = {
                userId: userId ? parseInt(userId) : null,
                action,
                eventTypes: eventTypes ? eventTypes.split(',').map(t => t.trim()) : null, // NEW
                startDate,
                endDate,
                page: parseInt(page),
                limit: parseInt(limit)
            };

            const result = await auditLogService.getAuditLogs(filters);

            res.json({
                success: true,
                data: result.data,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('Get audit logs error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy nhật ký kiểm toán'
                }
            });
        }
    }

    /**
     * Get security statistics for dashboard
     * GET /api/admin/security-statistics
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getSecurityStatistics(req, res) {
        try {
            const { days = 1 } = req.query;

            // Get today's successful logins
            const [todayLoginsResult] = await executeQuery(`
                SELECT COUNT(*) as count
                FROM auth_audit_logs
                WHERE action = 'login'
                AND success = 1
                AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `, [parseInt(days)]);

            // Get failed login attempts
            const [failedAttemptsResult] = await executeQuery(`
                SELECT COUNT(*) as count
                FROM auth_audit_logs
                WHERE action = 'login_failed'
                AND success = 0
                AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `, [parseInt(days)]);

            // Get currently locked accounts
            const [lockedAccountsResult] = await executeQuery(`
                SELECT COUNT(*) as count
                FROM users
                WHERE locked_until IS NOT NULL
                AND locked_until > NOW()
            `);

            // Get suspicious activities
            const [suspiciousActivitiesResult] = await executeQuery(`
                SELECT COUNT(*) as count
                FROM auth_audit_logs
                WHERE action = 'suspicious_activity'
                AND timestamp >= DATE_SUB(NOW(), INTERVAL ? DAY)
            `, [parseInt(days)]);

            res.json({
                success: true,
                statistics: {
                    todayLogins: todayLoginsResult.count || 0,
                    failedAttempts: failedAttemptsResult.count || 0,
                    lockedAccounts: lockedAccountsResult.count || 0,
                    suspiciousActivities: suspiciousActivitiesResult.count || 0
                }
            });
        } catch (error) {
            console.error('Get security statistics error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy thống kê bảo mật'
                }
            });
        }
    }

    /**
     * Get recent failed login attempts
     * GET /api/admin/failed-logins
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getFailedLogins(req, res) {
        try {
            const { limit = 100 } = req.query;

            const failedLogins = await executeQuery(`
                SELECT 
                    log_id,
                    action,
                    ip_address,
                    user_agent,
                    failure_reason,
                    timestamp
                FROM auth_audit_logs
                WHERE action = 'login_failed'
                AND success = 0
                ORDER BY timestamp DESC
                LIMIT ?
            `, [parseInt(limit)]);

            res.json({
                success: true,
                data: failedLogins
            });
        } catch (error) {
            console.error('Get failed logins error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy danh sách đăng nhập thất bại'
                }
            });
        }
    }

    /**
     * Get locked accounts
     * GET /api/admin/locked-accounts
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getLockedAccounts(req, res) {
        try {
            const lockedAccounts = await executeQuery(`
                SELECT 
                    id as user_id,
                    fullname as full_name,
                    email,
                    phone,
                    role,
                    login_attempts,
                    locked_until
                FROM users
                WHERE locked_until IS NOT NULL
                AND locked_until > NOW()
                ORDER BY locked_until DESC
            `);

            res.json({
                success: true,
                data: lockedAccounts
            });
        } catch (error) {
            console.error('Get locked accounts error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy danh sách tài khoản bị khóa'
                }
            });
        }
    }

    /**
     * Unlock a user account (admin action)
     * POST /api/admin/unlock-account/:userId
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async unlockAccount(req, res) {
        try {
            const { userId } = req.params;
            const adminUser = req.user; // Set by authMiddleware

            // Get user details
            const user = await queryFirst(
                'SELECT id as user_id, email, fullname as full_name, role FROM users WHERE id = ?',
                [userId]
            );

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'Không tìm thấy người dùng'
                    }
                });
            }

            // Unlock the account
            await executeQuery(
                'UPDATE users SET login_attempts = 0, locked_until = NULL WHERE id = ?',
                [userId]
            );

            // Log the admin action
            const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
            const userAgent = req.headers['user-agent'] || 'unknown';

            await auditLogService.logEvent({
                userId: adminUser.userId,
                action: 'account_unlock',
                ipAddress,
                userAgent,
                success: true,
                failureReason: `Admin ${adminUser.userId} unlocked account for user ${userId} (${user.email})`
            });

            res.json({
                success: true,
                message: `Đã mở khóa tài khoản ${user.email}`,
                user: {
                    id: user.user_id,
                    email: user.email,
                    fullName: user.full_name
                }
            });
        } catch (error) {
            console.error('Unlock account error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi mở khóa tài khoản'
                }
            });
        }
    }

    /**
     * Get audit statistics for charts
     * GET /api/admin/audit-statistics
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getAuditStatistics(req, res) {
        try {
            const { days = 7 } = req.query;

            const result = await auditLogService.getAuditStatistics(parseInt(days));

            res.json({
                success: true,
                data: result.data
            });
        } catch (error) {
            console.error('Get audit statistics error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy thống kê kiểm toán'
                }
            });
        }
    }

    /**
     * Get suspicious activities
     * GET /api/admin/suspicious-activities
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getSuspiciousActivities(req, res) {
        try {
            const { limit = 100 } = req.query;

            const activities = await executeQuery(`
                SELECT 
                    log_id,
                    user_id,
                    action,
                    ip_address,
                    user_agent,
                    failure_reason,
                    timestamp
                FROM auth_audit_logs
                WHERE action IN ('suspicious_activity', 'account_lockout')
                ORDER BY timestamp DESC
                LIMIT ?
            `, [parseInt(limit)]);

            res.json({
                success: true,
                data: activities
            });
        } catch (error) {
            console.error('Get suspicious activities error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy hoạt động đáng ngờ'
                }
            });
        }
    }

    /**
     * Get logs by IP address
     * GET /api/admin/logs-by-ip/:ipAddress
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getLogsByIP(req, res) {
        try {
            const { ipAddress } = req.params;
            const { limit = 50 } = req.query;

            const logs = await executeQuery(`
                SELECT 
                    log_id,
                    user_id,
                    action,
                    ip_address,
                    user_agent,
                    success,
                    failure_reason,
                    timestamp
                FROM auth_audit_logs
                WHERE ip_address = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `, [ipAddress, parseInt(limit)]);

            res.json({
                success: true,
                data: logs,
                ipAddress
            });
        } catch (error) {
            console.error('Get logs by IP error:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi khi lấy nhật ký theo IP'
                }
            });
        }
    }

    // ============ DASHBOARD STATISTICS ============

    /**
     * Get dashboard statistics
     * GET /api/admin/dashboard-stats
     * 
     * Requires admin authentication
     */
    async getDashboardStats(req, res) {
        try {
            console.log('📊 Fetching dashboard stats for admin');

            // Get total users count
            const usersCount = await queryFirst(
                'SELECT COUNT(*) as total FROM users'
            );

            // Get total appointments count
            const appointmentsCount = await queryFirst(
                'SELECT COUNT(*) as total FROM appointments'
            );

            // Get today's appointments count
            const todayCount = await queryFirst(
                'SELECT COUNT(*) as total FROM appointments WHERE DATE(appointment_date) = CURDATE()'
            );

            // Get pending appointments count (booked status)
            const pendingCount = await queryFirst(
                "SELECT COUNT(*) as total FROM appointments WHERE status = 'booked'"
            );

            // Get recent appointments (last 10)
            const recentAppointments = await executeQuery(
                `SELECT 
                    a.id,
                    a.patient_id,
                    a.doctor_id,
                    a.appointment_date,
                    a.time_slot,
                    a.status,
                    a.payment_status,
                    a.checked_in_at,
                    a.qr_code_token,
                    a.booking_code,
                    a.symptoms,
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
                ORDER BY a.created_at DESC
                LIMIT 10`
            );

            const stats = {
                totalUsers: usersCount.total,
                totalAppointments: appointmentsCount.total,
                todayAppointments: todayCount.total,
                pendingAppointments: pendingCount.total
            };

            console.log('✅ Dashboard stats:', stats);

            res.json({
                success: true,
                stats,
                recentAppointments
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Không thể tải thống kê'
                }
            });
        }
    }

    /**
     * Get all appointments for admin view
     * GET /api/admin/appointments
     * 
     * Requires admin authentication
     */
    async getAllAppointments(req, res) {
        try {
            const { status, date, doctorId, limit = 50, offset = 0 } = req.query;

            let query = `
                SELECT 
                    a.id,
                    a.patient_id,
                    a.doctor_id,
                    a.appointment_date,
                    a.time_slot,
                    a.status,
                    a.payment_status,
                    a.consultation_fee,
                    a.payment_method,
                    a.checked_in_at,
                    a.qr_code_token,
                    a.booking_code,
                    a.symptoms,
                    a.exam_type,
                    a.insurance_number,
                    a.hold_expires_at,
                    u.fullname as patient_name,
                    u.phone as patient_phone,
                    u.email as patient_email,
                    d.degree,
                    ud.fullname as doctor_name,
                    dept.name as department_name,
                    a.created_at
                FROM appointments a
                JOIN users u ON a.patient_id = u.id
                JOIN doctors d ON a.doctor_id = d.id
                JOIN users ud ON d.user_id = ud.id
                JOIN departments dept ON d.department_id = dept.id
                WHERE 1=1
            `;

            const params = [];

            if (status) {
                query += ' AND a.status = ?';
                params.push(status);
            }

            if (date) {
                query += ' AND DATE(a.appointment_date) = ?';
                params.push(date);
            }

            if (doctorId) {
                query += ' AND a.doctor_id = ?';
                params.push(doctorId);
            }

            query += ' ORDER BY a.appointment_date DESC, a.time_slot DESC LIMIT ? OFFSET ?';
            params.push(parseInt(limit), parseInt(offset));

            const appointments = await executeQuery(query, params);

            res.json({
                success: true,
                appointments,
                count: appointments.length
            });
        } catch (error) {
            console.error('Error fetching appointments:', error);
            res.status(500).json({
                success: false,
                error: {
                    code: 'DATABASE_ERROR',
                    message: 'Không thể tải danh sách lịch hẹn'
                }
            });
        }
    }

    /**
     * PUT /api/admin/appointments/:id   (admin)
     * Edit an appointment: doctor, date, time slot, symptoms, status (booked <-> cancelled).
     * - Completed appointments are read-only (they have a medical record and payments).
     * - Checked-in appointments are in today's queue: only symptoms can be edited.
     * - A new doctor/date/slot goes through the normal booking rules: not in the past, clinic
     *   open, doctor not on leave, slot not full (SLOT_CAPACITY), no second booking of the same
     *   patient with the same doctor in that slot.
     */
    async updateAppointment(req, res) {
        const id = parseInt(req.params.id, 10);
        const fail = (status, code, message) => res.status(status).json({ success: false, error: { code, message } });
        if (!id) return fail(400, 'VALIDATION_ERROR', 'Mã lịch hẹn không hợp lệ');

        const { doctorId, appointmentDate, timeSlot, symptoms, status } = req.body || {};
        if (status !== undefined && !['booked', 'cancelled'].includes(status)) {
            return fail(400, 'VALIDATION_ERROR', 'Trạng thái chỉ được đổi giữa "Đã xác nhận" và "Đã huỷ"');
        }
        if (appointmentDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(appointmentDate))) {
            return fail(400, 'VALIDATION_ERROR', 'Ngày khám không hợp lệ');
        }
        if (timeSlot !== undefined && !/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(String(timeSlot))) {
            return fail(400, 'VALIDATION_ERROR', 'Khung giờ không hợp lệ');
        }
        if (symptoms !== undefined && symptoms !== null && String(symptoms).length > 500) {
            return fail(400, 'VALIDATION_ERROR', 'Triệu chứng tối đa 500 ký tự');
        }

        const { pool } = require('../config/database');
        const appointmentService = require('../services/appointmentService');
        const { SLOT_CAPACITY, isSlotOver } = require('../config/booking');
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [[a]] = await conn.execute(
                `SELECT id, patient_id, doctor_id, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date,
                        time_slot, status, symptoms
                 FROM appointments WHERE id = ? FOR UPDATE`,
                [id]
            );
            if (!a) { await conn.rollback(); return fail(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn'); }

            const next = {
                doctor_id: doctorId !== undefined && doctorId !== '' ? parseInt(doctorId, 10) : a.doctor_id,
                appointment_date: appointmentDate || a.appointment_date,
                time_slot: timeSlot || a.time_slot,
                status: status || a.status,
                symptoms: symptoms !== undefined ? (String(symptoms || '').trim() || null) : a.symptoms
            };
            const scheduleChanged = next.doctor_id !== a.doctor_id
                || next.appointment_date !== a.appointment_date
                || next.time_slot !== a.time_slot;
            const statusChanged = next.status !== a.status;

            if (a.status === 'completed') {
                await conn.rollback();
                return fail(409, 'APPOINTMENT_COMPLETED', 'Lịch hẹn đã khám xong – không thể sửa (đã có hồ sơ bệnh án).');
            }
            if (a.status === 'checked_in' && (scheduleChanged || statusChanged)) {
                await conn.rollback();
                return fail(409, 'APPOINTMENT_CHECKED_IN', 'Bệnh nhân đã check-in và đang trong hàng đợi – chỉ sửa được triệu chứng.');
            }
            if (!Number.isInteger(next.doctor_id) || next.doctor_id <= 0) {
                await conn.rollback();
                return fail(400, 'VALIDATION_ERROR', 'Bác sĩ không hợp lệ');
            }

            // Re-validate the schedule when it changes, or when a cancelled booking is restored
            if (next.status === 'booked' && (scheduleChanged || statusChanged)) {
                const [[doc]] = await conn.execute('SELECT id FROM doctors WHERE id = ?', [next.doctor_id]);
                if (!doc) { await conn.rollback(); return fail(404, 'DOCTOR_NOT_FOUND', 'Không tìm thấy bác sĩ'); }
                if (isSlotOver(next.appointment_date, next.time_slot)) {
                    await conn.rollback();
                    return fail(400, 'PAST_APPOINTMENT', 'Khung giờ này đã qua – chọn ngày/giờ khác');
                }
                const block = await appointmentService.getDayBlock(next.doctor_id, next.appointment_date, conn);
                if (block) { await conn.rollback(); return fail(409, block.code, block.message); }
                const shiftService = require('../services/shiftService');
                const windows = await shiftService.getWindows(next.doctor_id, next.appointment_date, conn);
                if (!shiftService.slotInWindows(next.time_slot, windows)) {
                    await conn.rollback();
                    return fail(409, 'OUTSIDE_SHIFT', `Khung giờ nằm ngoài ca trực của bác sĩ (ca: ${shiftService.describe(windows)})`);
                }
                const [[slot]] = await conn.execute(
                    `SELECT COUNT(*) AS taken, COALESCE(SUM(patient_id = ?), 0) AS mine
                     FROM appointments
                     WHERE doctor_id = ? AND appointment_date = ? AND time_slot = ?
                       AND status IN ('booked', 'checked_in') AND id <> ?
                     FOR UPDATE`,
                    [a.patient_id, next.doctor_id, next.appointment_date, next.time_slot, id]
                );
                if (Number(slot.mine) > 0) {
                    await conn.rollback();
                    return fail(409, 'DUPLICATE_BOOKING', 'Bệnh nhân đã có lịch khác với bác sĩ này trong khung giờ đó');
                }
                if (Number(slot.taken) >= SLOT_CAPACITY) {
                    await conn.rollback();
                    return fail(409, 'SLOT_NOT_AVAILABLE', `Khung giờ ${next.time_slot} đã đủ ${SLOT_CAPACITY} bệnh nhân – chọn khung khác`);
                }
            }

            await conn.execute(
                `UPDATE appointments
                 SET doctor_id = ?, appointment_date = ?, time_slot = ?, status = ?, symptoms = ?
                 WHERE id = ?`,
                [next.doctor_id, next.appointment_date, next.time_slot, next.status, next.symptoms, id]
            );
            // New exam day or another department: new booking number
            if (next.appointment_date !== a.appointment_date || next.doctor_id !== a.doctor_id) {
                const [[deps]] = await conn.execute(
                    'SELECT (SELECT department_id FROM doctors WHERE id = ?) AS old_dep, (SELECT department_id FROM doctors WHERE id = ?) AS new_dep',
                    [a.doctor_id, next.doctor_id]
                );
                if (next.appointment_date !== a.appointment_date || deps.old_dep !== deps.new_dep) {
                    await require('../services/bookingCodeService').assignBookingCode(conn, id, next.doctor_id, next.appointment_date);
                }
            }
            await conn.commit();

            auditLogService.logActivity({
                userId: req.user.id,
                eventType: 'appointment_admin_updated',
                eventDetails: {
                    appointmentId: id,
                    before: { doctorId: a.doctor_id, date: a.appointment_date, timeSlot: a.time_slot, status: a.status },
                    after: { doctorId: next.doctor_id, date: next.appointment_date, timeSlot: next.time_slot, status: next.status }
                },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }).catch(() => undefined);

            return res.json({ success: true, message: `Đã cập nhật lịch hẹn #${id}` });
        } catch (error) {
            await conn.rollback().catch(() => undefined);
            console.error('Admin update appointment error:', error);
            return fail(500, 'DATABASE_ERROR', 'Không thể cập nhật lịch hẹn');
        } finally {
            conn.release();
        }
    }

    /**
     * DELETE /api/admin/appointments/:id   (admin)
     * Permanently delete a booking made by mistake / test data.
     * Refused when the visit has clinical or financial history (checked in, completed, medical
     * record, paid) – such appointments must be cancelled instead so records and revenue stay intact.
     */
    async deleteAppointment(req, res) {
        const id = parseInt(req.params.id, 10);
        const fail = (status, code, message) => res.status(status).json({ success: false, error: { code, message } });
        if (!id) return fail(400, 'VALIDATION_ERROR', 'Mã lịch hẹn không hợp lệ');

        const { pool } = require('../config/database');
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const [[a]] = await conn.execute(
                `SELECT a.id, a.status, a.payment_status, a.patient_id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS d,
                        a.time_slot, u.fullname AS patient_name,
                        (SELECT COUNT(*) FROM medical_records mr WHERE mr.appointment_id = a.id) AS records,
                        (SELECT COUNT(*) FROM payment_transactions pt
                          WHERE pt.transaction_type = 'consultation' AND pt.reference_id = a.id
                            AND pt.payment_status IN ('completed', 'refunded')) AS paid_tx
                 FROM appointments a JOIN users u ON u.id = a.patient_id
                 WHERE a.id = ? FOR UPDATE`,
                [id]
            );
            if (!a) { await conn.rollback(); return fail(404, 'APPOINTMENT_NOT_FOUND', 'Không tìm thấy lịch hẹn'); }
            if (['checked_in', 'completed'].includes(a.status) || Number(a.records) > 0) {
                await conn.rollback();
                return fail(409, 'HAS_MEDICAL_HISTORY', 'Lịch hẹn đã check-in/khám – không thể xoá vì sẽ mất hồ sơ bệnh án.');
            }
            if (a.payment_status !== 'unpaid' || Number(a.paid_tx) > 0) {
                await conn.rollback();
                return fail(409, 'HAS_PAYMENT', 'Lịch hẹn đã thanh toán – không thể xoá vì ảnh hưởng doanh thu. Hãy chọn "Huỷ lịch" (và hoàn tiền nếu cần).');
            }

            await conn.execute(
                `DELETE FROM payment_transactions
                 WHERE transaction_type = 'consultation' AND reference_id = ? AND payment_status IN ('pending', 'failed')`,
                [id]
            );
            await conn.execute('DELETE FROM appointments WHERE id = ?', [id]);
            await conn.commit();

            auditLogService.logActivity({
                userId: req.user.id,
                eventType: 'appointment_admin_deleted',
                eventDetails: { appointmentId: id, patientId: a.patient_id, patientName: a.patient_name, date: a.d, timeSlot: a.time_slot, status: a.status },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }).catch(() => undefined);

            return res.json({ success: true, message: `Đã xoá lịch hẹn #${id} của ${a.patient_name}` });
        } catch (error) {
            await conn.rollback().catch(() => undefined);
            console.error('Admin delete appointment error:', error);
            return fail(500, 'DATABASE_ERROR', 'Không thể xoá lịch hẹn');
        } finally {
            conn.release();
        }
    }

    /**
     * GET /api/admin/reports/export?type=appointments|revenue&from=YYYY-MM-DD&to=YYYY-MM-DD
     * Downloads a CSV report (opens directly in Excel). Admin only. Range: at most 366 days.
     */
    async exportReport(req, res) {
        try {
            const { type, from, to } = req.query;
            const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
            if (!['appointments', 'revenue'].includes(type)) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Loại báo cáo không hợp lệ' } });
            }
            if (!isDate(from) || !isDate(to) || from > to) {
                return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Khoảng ngày không hợp lệ' } });
            }
            const spanDays = (Date.parse(to) - Date.parse(from)) / 86400000;
            if (spanDays > 366) {
                return res.status(400).json({ success: false, error: { code: 'RANGE_TOO_LARGE', message: 'Chỉ xuất tối đa 1 năm mỗi lần' } });
            }

            const fmtDay = (ymd) => (ymd ? String(ymd).split('-').reverse().join('/') : '');
            const fmtDateTime = (v) => {
                if (!v) return '';
                const d = new Date(v);
                const p = (n) => String(n).padStart(2, '0');
                return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
            };
            // '0901 234 567': Excel keeps it as text (a bare 0901234567 loses its leading zero)
            const fmtPhone = (ph) => (/^\d{10}$/.test(ph || '') ? `${ph.slice(0, 4)} ${ph.slice(4, 7)} ${ph.slice(7)}` : (ph || ''));
            const METHOD = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', card: 'Thẻ', momo: 'MoMo', vnpay: 'VNPay' };
            const PAY = { paid: 'Đã thanh toán', unpaid: 'Chưa thanh toán', refunded: 'Đã hoàn tiền' };
            const rows = [];
            let filename;

            if (type === 'appointments') {
                const list = await executeQuery(
                    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date, a.time_slot,
                            a.status, a.checked_in_at, a.consultation_fee, a.payment_status, a.payment_method,
                            a.symptoms, a.created_at, a.exam_type,
                            (a.status = 'booked' AND a.appointment_date < CURDATE()) AS no_show,
                            u.fullname AS patient_name, u.phone AS patient_phone,
                            ud.fullname AS doctor_name, dept.name AS department_name
                     FROM appointments a
                     JOIN users u ON u.id = a.patient_id
                     JOIN doctors d ON d.id = a.doctor_id
                     JOIN users ud ON ud.id = d.user_id
                     LEFT JOIN departments dept ON dept.id = d.department_id
                     WHERE a.appointment_date BETWEEN ? AND ?
                     ORDER BY a.appointment_date ASC, a.time_slot ASC, a.id ASC`,
                    [from, to]
                );
                const STATUS = { booked: 'Đã xác nhận', checked_in: 'Đã check-in', completed: 'Đã khám', cancelled: 'Đã huỷ' };

                rows.push([`BÁO CÁO LỊCH HẸN TỪ ${fmtDay(from)} ĐẾN ${fmtDay(to)}`]);
                rows.push([`Xuất lúc ${fmtDateTime(new Date())}`]);
                rows.push([]);
                rows.push(['Mã LH', 'Ngày khám', 'Khung giờ', 'Bệnh nhân', 'Số điện thoại', 'Bác sĩ', 'Chuyên khoa',
                    'Loại hình', 'Trạng thái', 'Giờ check-in', 'Phí khám (đ)', 'Thanh toán', 'Hình thức', 'Triệu chứng', 'Ngày đặt']);
                const counts = { 'Đã xác nhận': 0, 'Đã check-in': 0, 'Đã khám': 0, 'Đã huỷ': 0, 'Không đến': 0 };
                let feeTotal = 0;
                let paidTotal = 0;
                list.forEach((a) => {
                    const status = Number(a.no_show) ? 'Không đến' : (STATUS[a.status] || a.status);
                    counts[status] = (counts[status] || 0) + 1;
                    const fee = a.consultation_fee != null ? Number(a.consultation_fee) : null;
                    if (a.status !== 'cancelled' && fee) feeTotal += fee;
                    if (a.payment_status === 'paid' && fee) paidTotal += fee;
                    rows.push([
                        a.id, fmtDay(a.appointment_date), a.time_slot, a.patient_name, fmtPhone(a.patient_phone),
                        a.doctor_name, a.department_name || '', a.exam_type === 'insurance' ? 'BHYT' : 'Dịch vụ', status, fmtDateTime(a.checked_in_at),
                        fee, PAY[a.payment_status] || a.payment_status || '', METHOD[a.payment_method] || '',
                        a.symptoms || '', fmtDateTime(a.created_at)
                    ]);
                });
                rows.push([]);
                rows.push(['TỔNG HỢP']);
                rows.push(['Tổng số lịch hẹn', list.length]);
                Object.entries(counts).forEach(([k, v]) => rows.push([k, v]));
                rows.push(['Tổng phí khám (không tính lịch huỷ)', feeTotal]);
                rows.push(['Phí khám đã thu', paidTotal]);
                filename = `lich-hen_${from}_${to}.csv`;
            } else {
                const stats = await paymentService.getRevenueStatistics({ start_date: from, end_date: to });
                rows.push([`BÁO CÁO DOANH THU TỪ ${fmtDay(from)} ĐẾN ${fmtDay(to)}`]);
                rows.push([`Xuất lúc ${fmtDateTime(new Date())}`]);
                rows.push([]);
                rows.push(['Tổng doanh thu (đ)', stats.total.revenue]);
                rows.push(['Số giao dịch', stats.total.transactions]);
                rows.push(['Tiền đã hoàn trả (đ)', stats.refunds.amount]);
                rows.push(['Số giao dịch hoàn tiền', stats.refunds.count]);
                rows.push([]);
                rows.push(['DOANH THU THEO NGÀY']);
                rows.push(['Ngày', 'Phí khám (đ)', 'Tiền thuốc (đ)', 'Tổng (đ)', 'Số giao dịch']);
                stats.by_day.forEach((d) => rows.push([fmtDay(d.date), d.consultation, d.medication, d.revenue, d.count]));
                rows.push(['Cộng',
                    stats.by_day.reduce((s, d) => s + d.consultation, 0),
                    stats.by_day.reduce((s, d) => s + d.medication, 0),
                    stats.by_day.reduce((s, d) => s + d.revenue, 0),
                    stats.by_day.reduce((s, d) => s + d.count, 0)]);
                rows.push([]);
                rows.push(['DOANH THU THEO CHUYÊN KHOA']);
                rows.push(['Chuyên khoa', 'Doanh thu (đ)', 'Số giao dịch']);
                stats.by_department.forEach((d) => rows.push([d.department_name, d.revenue, d.count]));
                rows.push([]);
                rows.push(['THEO HÌNH THỨC THANH TOÁN']);
                rows.push(['Hình thức', 'Doanh thu (đ)', 'Số giao dịch']);
                stats.by_method.forEach((m) => rows.push([METHOD[m.payment_method] || m.payment_method, m.revenue, m.count]));
                filename = `doanh-thu_${from}_${to}.csv`;
            }

            auditLogService.logActivity({
                userId: req.user.id,
                eventType: 'report_exported',
                eventDetails: { type, from, to },
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }).catch(() => undefined);

            // format=json: the same table for the printable / PDF report in the browser
            if (req.query.format === 'json') {
                return res.json({ success: true, data: { filename: filename.replace(/\.csv$/, ''), rows } });
            }
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(toCsv(rows));
        } catch (error) {
            console.error('Export report error:', error);
            res.status(500).json({ success: false, error: { code: 'EXPORT_FAILED', message: 'Không thể xuất báo cáo' } });
        }
    }
}

module.exports = new AdminController();
