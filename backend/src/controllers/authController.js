const jwtService = require('../services/jwtService');

const MAX_FAILED_LOGINS = (() => {
  const fromEnv = parseInt(process.env.ACCOUNT_LOCK_MAX_ATTEMPTS, 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return ['production', 'test'].includes(process.env.NODE_ENV) ? 5 : 1000;
})();
const passwordService = require('../services/passwordService');
const validators = require('../utils/validators');
const { executeQuery, queryFirst, transaction } = require('../config/database');
const crypto = require('crypto');
const auditLogService = require('../services/auditLogService');
const otpService = require('../services/otpService');

const REMEMBER_ME_EXPIRES = process.env.JWT_REMEMBER_EXPIRES_IN || '7d';
const LOCK_MINUTES = 15;
const PASSWORD_ERRORS_VI = [
    [/at least 8/i, 'ít nhất 8 ký tự'], [/exceed/i, 'tối đa 128 ký tự'], [/uppercase/i, 'có chữ hoa (A-Z)'],
    [/lowercase/i, 'có chữ thường (a-z)'], [/number/i, 'có chữ số (0-9)'],
    [/weak patterns/i, 'không bắt đầu bằng chuỗi dễ đoán (123…, abc…, password, admin)']
];
const viPasswordErrors = (errors = []) => errors.map((e) => (PASSWORD_ERRORS_VI.find(([re]) => re.test(e)) || [null, e])[1]);
const isEmailLike = (v) => String(v || '').includes('@');
// 0901234567, 090 123 4567, +84901234567 -> 0901234567
const normalizePhone = (v) => {
  const digits = String(v || '').replace(/[\s.\-()]/g, '');
  const local = digits.replace(/^\+?84/, '0');
  return /^0\d{9,10}$/.test(local) ? local : null;
};

/**
 * Registration with OTP (use case "Đăng ký tài khoản"): the account is created but must confirm
 * its e-mail with a 6-digit code before the first login. Returns the 201 body to send.
 */
const startOtpVerification = async (user, message) => {
    await executeQuery('UPDATE users SET otp_required = 1, email_verified = 0 WHERE id = ?', [user.id]);
    let otp;
    try {
        otp = await otpService.issue(user);
    } catch (error) {
        // the account exists; the code can be requested again from the login screen
        console.error('Could not send registration OTP:', error.message);
        otp = { delivery: 'failed' };
    }
    return {
        success: true,
        requiresOtp: true,
        message,
        email: user.email,
        otp
    };
};

const getRequestInfo = (req) => {
    const forwardedFor = req?.headers?.['x-forwarded-for'];
    const ipAddress = req?.ip ||
        (forwardedFor ? String(forwardedFor).split(',')[0].trim() : '') ||
        req?.connection?.remoteAddress ||
        'unknown';

    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    return { ipAddress, userAgent };
};

/**
 * Authentication Controller
 * Handles all core authentication operations including user registration,
 * login, logout, and password recovery for the THCT Clinic system.
 *
 * Implements Requirements: 1.1, 2.1, 2.2, 4.4, 6.6
 */

class AuthController {
    /**
     * User Registration - Creates new user account with validation
     * POST /api/auth/register
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     *
     * Validates Requirements:
     * - 1.1: User registration with validation and user creation
     * - 1.2: Email uniqueness validation
     * - 1.3: Phone uniqueness validation
     * - 1.4: Password hashing with bcrypt
     * - 1.7: Default 'patient' role for public registrations
     */
    async register(req, res) {
        try {
            const { fullName, email, phone, password, dateOfBirth, role } = req.body;

            // Validate and sanitize registration data
            const validation = validators.validateRegistrationData({
                fullName,
                email,
                phone,
                password,
                dateOfBirth,
                role: role || 'patient' // Default to patient role
            });

            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: 'Invalid registration data',
                        details: validation.errors
                    }
                });
            }

            const sanitizedData = validation.sanitizedData;

            // Get IP address and user agent for audit logging
            const { ipAddress, userAgent } = getRequestInfo(req);

            // Check email uniqueness
            const existingUserByEmail = await queryFirst(
                'SELECT id as user_id FROM users WHERE email = ?',
                [sanitizedData.email]
            );

            if (existingUserByEmail) {
                // Log failed registration attempt
                await auditLogService.logFailedRegistration(
                    sanitizedData.email,
                    ipAddress,
                    userAgent,
                    'Email already registered'
                );

                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'DUPLICATE_EMAIL',
                        message: 'Email đã được sử dụng',
                        details: { email: 'Email address is already registered' }
                    }
                });
            }

            // Check phone uniqueness
            const existingUserByPhone = await queryFirst(
                'SELECT id as user_id, email, password, role FROM users WHERE phone = ?',
                [sanitizedData.phone]
            );

            // A guest account (created when someone booked without an account) is claimed
            // by registering with the same phone number: it becomes a real account and keeps
            // its appointment history. Without this, guests could never register.
            const isGuestAccount = existingUserByPhone
                && existingUserByPhone.role === 'patient'
                && existingUserByPhone.password === 'N/A'
                && /^guest_\d+@temp\.com$/.test(existingUserByPhone.email || '');

            if (isGuestAccount) {
                const hashedPassword = await passwordService.hashPassword(sanitizedData.password);
                await executeQuery(
                    `UPDATE users
                     SET fullname = ?, email = ?, password = ?, date_of_birth = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [
                        sanitizedData.fullName,
                        sanitizedData.email,
                        hashedPassword,
                        sanitizedData.dateOfBirth || null,
                        existingUserByPhone.user_id
                    ]
                );

                await auditLogService.logRegistration(existingUserByPhone.user_id, ipAddress, userAgent);
                if (otpService.isEnabled()) {
                    return res.status(201).json(await startOtpVerification(
                        { id: existingUserByPhone.user_id, email: sanitizedData.email, fullname: sanitizedData.fullName },
                        'Đăng ký thành công – nhập mã OTP vừa gửi tới email để kích hoạt tài khoản. Các lịch hẹn đã đặt trước đó với số điện thoại này được giữ lại.'
                    ));
                }

                const token = jwtService.generateToken({
                    userId: existingUserByPhone.user_id,
                    email: sanitizedData.email,
                    role: 'patient',
                    fullName: sanitizedData.fullName
                });

                return res.status(201).json({
                    success: true,
                    message: 'Đăng ký tài khoản thành công. Các lịch hẹn đã đặt trước đó với số điện thoại này được giữ lại.',
                    user: {
                        id: existingUserByPhone.user_id,
                        fullName: sanitizedData.fullName,
                        email: sanitizedData.email,
                        phone: sanitizedData.phone,
                        role: 'patient',
                        dateOfBirth: sanitizedData.dateOfBirth
                    },
                    token
                });
            }

            if (existingUserByPhone) {
                // Log failed registration attempt
                await auditLogService.logFailedRegistration(
                    sanitizedData.email,
                    ipAddress,
                    userAgent,
                    'Phone number already registered'
                );

                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'DUPLICATE_PHONE',
                        message: 'Số điện thoại đã được sử dụng',
                        details: { phone: 'Phone number is already registered' }
                    }
                });
            }

            // Hash password with bcrypt (minimum salt rounds 12)
            const hashedPassword = await passwordService.hashPassword(sanitizedData.password);

            // Create user account using transaction for data integrity
            const result = await transaction(async (connection) => {
                const [insertResult] = await connection.execute(
                    `INSERT INTO users (fullname, email, phone, password, date_of_birth, role, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        sanitizedData.fullName,
                        sanitizedData.email,
                        sanitizedData.phone,
                        hashedPassword,
                        sanitizedData.dateOfBirth || null,
                        'patient' // Default role for registration
                    ]
                );

                return insertResult;
            });

            if (otpService.isEnabled()) {
                await auditLogService.logRegistration(result.insertId, ipAddress, userAgent);
                return res.status(201).json(await startOtpVerification(
                    { id: result.insertId, email: sanitizedData.email, fullname: sanitizedData.fullName },
                    'Đăng ký thành công – nhập mã OTP vừa gửi tới email để kích hoạt tài khoản.'
                ));
            }

            // Generate JWT token for immediate login
            const tokenPayload = {
                userId: result.insertId,
                email: sanitizedData.email,
                role: 'patient',
                fullName: sanitizedData.fullName
            };

            const token = jwtService.generateToken(tokenPayload);

            // Log successful registration
            await auditLogService.logRegistration(result.insertId, ipAddress, userAgent);

            // Return success response with user data and token
            res.status(201).json({
                success: true,
                message: 'Đăng ký tài khoản thành công',
                user: {
                    id: result.insertId,
                    fullName: sanitizedData.fullName,
                    email: sanitizedData.email,
                    phone: sanitizedData.phone,
                    role: 'patient', // registration always creates a patient account
                    dateOfBirth: sanitizedData.dateOfBirth
                },
                token
            });

        } catch (error) {
            console.error('Registration error:', error);

            // Handle specific database errors
            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'DUPLICATE_DATA',
                        message: 'Email hoặc số điện thoại đã được sử dụng'
                    }
                });
            }

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi đăng ký tài khoản'
                }
            });
        }
    }

    /**
     * User Login - Authenticates user and generates JWT token
     * POST /api/auth/login
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     *
     * Validates Requirements:
     * - 2.1: Credential verification and JWT token generation
     * - 2.2: Invalid credentials error handling
     * - 2.3: JWT token with user_id, role, and expiration
     * - 2.4: 24-hour token lifespan
     */
    async login(req, res) {
        try {
            // "email" may also hold a phone number (patients often remember their phone, not their e-mail)
            const identifier = String(req.body.identifier ?? req.body.email ?? '').trim();
            const { password } = req.body;
            const rememberMe = req.body.rememberMe === true || req.body.rememberMe === 'true';
            const phone = isEmailLike(identifier) ? null : normalizePhone(identifier);
            const email = phone ? null : identifier;

            // Get IP address and user agent for audit logging
            const { ipAddress, userAgent } = getRequestInfo(req);

            if (!identifier) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Vui lòng nhập email hoặc số điện thoại' }
                });
            }
            if (!isEmailLike(identifier) && !phone) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Email hoặc số điện thoại không hợp lệ' }
                });
            }

            // Validate login credentials (phone logins only need a password)
            const validation = phone
                ? { isValid: Boolean(password && String(password).length), errors: { password: 'Vui lòng nhập mật khẩu' } }
                : validators.validateLoginCredentials({ email, password });

            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_ERROR',
                        message: validation.errors.password && !validation.errors.email ? 'Vui lòng nhập mật khẩu' : 'Email không hợp lệ',
                        details: validation.errors
                    }
                });
            }

            const USER_COLUMNS = 'id as user_id, fullname as full_name, email, phone, password, role, login_attempts, locked_until, otp_required, email_verified';
            // Find user by e-mail, or by phone among accounts that have a password
            // (guest accounts created by walk-in booking share phones but cannot log in)
            const user = phone
                ? await queryFirst(
                    `SELECT ${USER_COLUMNS} FROM users WHERE phone = ? AND password LIKE '$2%'
                     ORDER BY (last_login IS NULL), last_login DESC, id LIMIT 1`,
                    [phone]
                )
                : await queryFirst(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email.toLowerCase()]);
            const loginName = phone || email.toLowerCase();

            // Check if user exists (use generic message for security)
            if (!user) {
                // Log failed login attempt
                await auditLogService.logFailedLogin(
                    loginName,
                    ipAddress,
                    userAgent,
                    'User not found'
                );

                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: phone ? 'Số điện thoại hoặc mật khẩu không đúng' : 'Email hoặc mật khẩu không đúng'
                    }
                });
            }

            // Check if account is locked
            if (user.locked_until && new Date() < new Date(user.locked_until)) {
                const minutesLeft = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
                return res.status(423).json({
                    success: false,
                    error: {
                        code: 'ACCOUNT_LOCKED',
                        message: `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${minutesLeft} phút hoặc bấm "Quên mật khẩu".`,
                        retryAfterMinutes: minutesLeft
                    }
                });
            }

            // Verify password
            // Guest accounts (created by public booking) have no usable password hash;
            // treat them as invalid credentials instead of crashing with a 500.
            let isPasswordValid = false;
            try {
                isPasswordValid = await passwordService.comparePassword(password, user.password);
            } catch (compareError) {
                isPasswordValid = false;
            }

            if (!isPasswordValid) {
                // Increment login attempts
                const newAttempts = (user.login_attempts || 0) + 1;
                // Lock after MAX_FAILED_LOGINS wrong passwords (production: 5; dev: 1000 so testing never locks accounts)
                const shouldLock = newAttempts >= MAX_FAILED_LOGINS;

                // Lock account if too many failed attempts (5 attempts)
                if (shouldLock) {
                    const lockUntil = new Date();
                    lockUntil.setMinutes(lockUntil.getMinutes() + LOCK_MINUTES);

                    await executeQuery(
                        'UPDATE users SET login_attempts = ?, locked_until = ? WHERE id = ?',
                        [newAttempts, lockUntil, user.user_id]
                    );

                    return res.status(423).json({
                        success: false,
                        error: {
                            code: 'ACCOUNT_LOCKED',
                            message: `Tài khoản tạm khoá ${LOCK_MINUTES} phút do đăng nhập sai nhiều lần. Bấm "Quên mật khẩu" để đặt lại ngay.`,
                            retryAfterMinutes: LOCK_MINUTES
                        }
                    });
                } else {
                    // Just increment attempts
                    await executeQuery(
                        'UPDATE users SET login_attempts = ? WHERE id = ?',
                        [newAttempts, user.user_id]
                    );
                }

                const attemptsLeft = MAX_FAILED_LOGINS - newAttempts;
                return res.status(401).json({
                    success: false,
                    error: {
                        code: 'INVALID_CREDENTIALS',
                        message: (phone ? 'Số điện thoại hoặc mật khẩu không đúng' : 'Email hoặc mật khẩu không đúng')
                            + (attemptsLeft <= 3 ? ` – còn ${attemptsLeft} lần thử trước khi tạm khoá` : ''),
                        ...(attemptsLeft <= 3 ? { attemptsLeft } : {})
                    }
                });
            }

            // Registered with OTP but the e-mail is not confirmed yet
            if (Number(user.otp_required) === 1 && Number(user.email_verified) !== 1 && otpService.isEnabled()) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: 'EMAIL_NOT_VERIFIED',
                        message: 'Tài khoản chưa xác thực email. Nhập mã OTP đã gửi tới email (hoặc bấm "Gửi lại mã").',
                        email: user.email
                    }
                });
            }

            // Reset login attempts on successful login and update last_login
            await executeQuery(
                'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = ?',
                [user.user_id]
            );

            // Generate JWT token
            const tokenPayload = {
                userId: user.user_id,
                email: user.email,
                role: user.role,
                fullName: user.full_name
            };

            // "Ghi nhớ đăng nhập" keeps the session for 7 days instead of 24 hours
            const token = jwtService.generateToken(tokenPayload, rememberMe ? REMEMBER_ME_EXPIRES : undefined);

            // Successful logins were never recorded, so security statistics always showed 0
            await auditLogService.logLogin(user.user_id, ipAddress, userAgent);

            // Return successful login response
            res.json({
                success: true,
                message: 'Đăng nhập thành công',
                user: {
                    id: user.user_id,
                    fullName: user.full_name,
                    email: user.email,
                    phone: user.phone,
                    role: user.role
                },
                token
            });

        } catch (error) {
            console.error('Login error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi đăng nhập'
                }
            });
        }
    }

    /**
     * User Logout - Invalidates JWT token (client-side implementation)
     * POST /api/auth/logout
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     *
     * Validates Requirements:
     * - 4.4: Token invalidation for logout
     */
    async logout(req, res) {
        try {
            // For stateless JWT, logout is primarily handled client-side
            // Server can optionally maintain a blacklist of invalidated tokens
            // For now, we'll return success and let client handle token removal

            const user = req.user; // Set by authMiddleware

            // Log logout event for audit purposes
            console.log(`User logout: ${user.email} (ID: ${user.userId}) at ${new Date().toISOString()}`);

            // Optional: Add token to blacklist table for enhanced security
            // This would require storing the JTI (JWT ID) in a blacklist table
            // For MVP implementation, client-side token removal is sufficient

            res.json({
                success: true,
                message: 'Đăng xuất thành công'
            });

        } catch (error) {
            console.error('Logout error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi đăng xuất'
                }
            });
        }
    }

    /**
     * Forgot Password - Initiates password reset process
     * POST /api/auth/forgot-password
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     *
     * Validates Requirements:
     * - 6.6: Password recovery functionality
     */
    /**
     * POST /api/auth/verify-otp { email, code } – confirm the e-mail of a new account
     */
    async verifyOtp(req, res) {
        try {
            const result = await otpService.verify(req.body?.email, req.body?.code);
            const { ipAddress, userAgent } = getRequestInfo(req);
            auditLogService.logActivity({
                userId: result.userId, eventType: 'email_verified_otp', eventDetails: { alreadyVerified: Boolean(result.alreadyVerified) }, ipAddress, userAgent
            }).catch(() => undefined);
            res.json({
                success: true,
                message: result.alreadyVerified
                    ? 'Tài khoản đã được xác thực trước đó – bạn có thể đăng nhập.'
                    : 'Xác thực thành công! Tài khoản đã được kích hoạt, mời bạn đăng nhập.'
            });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
            }
            console.error('Verify OTP error:', error);
            res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Không thể xác thực mã OTP' } });
        }
    }

    /**
     * POST /api/auth/resend-otp { email } – new code for an account that is not verified yet.
     * Always answers the same way for unknown e-mails (no account enumeration).
     */
    async resendOtp(req, res) {
        try {
            const email = String(req.body?.email || '').trim().toLowerCase();
            const user = await queryFirst('SELECT id, email, fullname, email_verified, otp_required FROM users WHERE email = ?', [email]);
            if (!user || Number(user.otp_required) !== 1 || Number(user.email_verified) === 1) {
                return res.json({ success: true, message: 'Nếu email cần xác thực, mã mới đã được gửi.' });
            }
            const otp = await otpService.issue(user);
            res.json({ success: true, message: 'Đã gửi mã OTP mới tới email của bạn.', otp });
        } catch (error) {
            if (error.status) {
                return res.status(error.status).json({ success: false, error: { code: error.code, message: error.message, retryAfter: error.retryAfter } });
            }
            console.error('Resend OTP error:', error);
            res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Không thể gửi lại mã OTP' } });
        }
    }

    async forgotPassword(req, res) {
        try {
            const { email } = req.body;

            // Validate email format
            const emailValidation = validators.validateEmail(email);
            if (!emailValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_EMAIL',
                        message: 'Định dạng email không hợp lệ'
                    }
                });
            }

            // Find user by email
            const user = await queryFirst(
                'SELECT id as user_id, email, fullname as full_name FROM users WHERE email = ?',
                [email.trim().toLowerCase()]
            );

            // Always return success for security (don't reveal if email exists)
            // But only process if user actually exists
            let otp = null;
            if (user) {
                // 6-digit code by e-mail, entered on the "Quên mật khẩu" screen
                try {
                    otp = await otpService.issue({ id: user.user_id, email: user.email, fullname: user.full_name }, 'reset');
                } catch (otpError) {
                    if (otpError.status) {
                        return res.status(otpError.status).json({
                            success: false,
                            error: { code: otpError.code, message: otpError.message, retryAfter: otpError.retryAfter }
                        });
                    }
                    throw otpError;
                }
                // Generate secure reset token
                const resetToken = crypto.randomBytes(32).toString('hex');
                const resetExpires = new Date();
                resetExpires.setHours(resetExpires.getHours() + 1); // Token expires in 1 hour

                // Store reset token in database
                await executeQuery(
                    'UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?',
                    [resetToken, resetExpires, user.user_id]
                );

                // TODO: Send password reset email
                // This would integrate with email service to send reset link
                console.log(`Password reset requested for: ${user.email}`);
            }

            // Always return success message for security
            res.json({
                success: true,
                message: 'Nếu email có trong hệ thống, mã xác nhận 6 số đã được gửi tới email đó.',
                ttlMinutes: otpService.OTP_TTL_MINUTES,
                // demo mode only (no SMTP, not production): show the code so the flow can be tried
                ...(otp && otp.devCode ? { devCode: otp.devCode } : {})
            });

        } catch (error) {
            console.error('Forgot password error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi xử lý yêu cầu đặt lại mật khẩu'
                }
            });
        }
    }

    /**
     * Reset Password - Completes password reset with token
     * POST /api/auth/reset-password
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     *
     * Validates Requirements:
     * - 6.6: Password reset completion
     * - 5.3: New password hashing
     */
    async resetPassword(req, res) {
        try {
            const { token, newPassword, email, code } = req.body;
            const byCode = Boolean(email && code);

            // Validate inputs
            if (!byCode && (!token || typeof token !== 'string')) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_TOKEN',
                        message: 'Token đặt lại mật khẩu không hợp lệ'
                    }
                });
            }

            // Validate new password strength
            const passwordValidation = validators.validatePassword(newPassword);
            if (!passwordValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'WEAK_PASSWORD',
                        message: 'Mật khẩu mới chưa đủ mạnh: ' + viPasswordErrors(passwordValidation.errors).join('; '),
                        details: passwordValidation.errors
                    }
                });
            }

            // Find the user: by e-mail + 6-digit code, or by the reset token
            let user;
            if (byCode) {
                try {
                    const found = await otpService.verifyReset(email, code);
                    user = { user_id: found.id, email: found.email };
                } catch (otpError) {
                    if (otpError.status) {
                        return res.status(otpError.status).json({ success: false, error: { code: otpError.code, message: otpError.message } });
                    }
                    throw otpError;
                }
            } else {
                user = await queryFirst(
                    'SELECT id as user_id, email, fullname as full_name FROM users WHERE password_reset_token = ? AND password_reset_expires > NOW()',
                    [token]
                );
            }

            if (!user) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'INVALID_OR_EXPIRED_TOKEN',
                        message: 'Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn'
                    }
                });
            }

            // Hash new password
            const hashedPassword = await passwordService.hashPassword(newPassword);

            // Update password, clear reset token and unlock (the e-mail was just proven)
            await executeQuery(
                `UPDATE users SET password = ?, password_reset_token = NULL, password_reset_expires = NULL,
                    login_attempts = 0, locked_until = NULL${byCode ? ', email_verified = 1' : ''} WHERE id = ?`,
                [hashedPassword, user.user_id]
            );

            // Log password change for audit
            console.log(`Password reset completed for user: ${user.email} (ID: ${user.user_id})`);

            res.json({
                success: true,
                message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.'
            });

        } catch (error) {
            console.error('Reset password error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi đặt lại mật khẩu'
                }
            });
        }
    }

    /**
     * Get Current User Profile - Returns authenticated user's information
     * GET /api/auth/profile
     *
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     */
    async getProfile(req, res) {
        try {
            const user = req.user; // Set by authMiddleware

            // Get complete user information from database
            const userProfile = await queryFirst(
                'SELECT id as user_id, fullname as full_name, email, phone, date_of_birth, role, created_at, last_login FROM users WHERE id = ?',
                [user.userId]
            );

            if (!userProfile) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'USER_NOT_FOUND',
                        message: 'Không tìm thấy thông tin người dùng'
                    }
                });
            }

            res.json({
                success: true,
                user: {
                    id: userProfile.user_id,
                    fullName: userProfile.full_name,
                    email: userProfile.email,
                    phone: userProfile.phone,
                    dateOfBirth: userProfile.date_of_birth,
                    role: userProfile.role,
                    createdAt: userProfile.created_at,
                    lastLogin: userProfile.last_login
                }
            });

        } catch (error) {
            console.error('Get profile error:', error);

            res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Lỗi server khi lấy thông tin người dùng'
                }
            });
        }
    }
}

module.exports = new AuthController();