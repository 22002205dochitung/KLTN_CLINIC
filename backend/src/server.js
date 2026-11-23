const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import security middleware
const { securityMiddleware, securityAuditMiddleware } = require('./middleware/securityMiddleware');

// Import rate limiting middleware
const { 
  globalRateLimit, 
  authRateLimit, 
  ipBlockingMiddleware, 
  rateLimitInfoMiddleware 
} = require('./middleware/rateLimitMiddleware');

const app = express();

// Behind Nginx (VPS) the client IP is in X-Forwarded-For: TRUST_PROXY=1 lets rate limits and
// audit logs see the real visitor instead of 127.0.0.1 for everybody.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

/**
 * Middleware Application Order (CRITICAL)
 * Order matters for security and functionality
 * 
 * Task 5.3: Configure /api/auth routes with rate limiting and validation
 * Requirements validated: 8.1, 8.2, 8.3, 8.4
 */

// 1. CORS configuration (MUST BE FIRST to handle preflight requests)
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost on any port and local network
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
      /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
      /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+:\d+$/
    ];
    
    // production domains, e.g. CORS_ORIGINS=https://thctclinic.vn,https://www.thctclinic.vn
    String(process.env.CORS_ORIGINS || process.env.APP_URL || '')
      .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
      .forEach((o) => allowedOrigins.push(o));

    const isAllowed = allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') return pattern === origin;
      return pattern.test(origin);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 2. Body parsing middleware (required before routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 3. IP blocking middleware (security)
app.use(ipBlockingMiddleware);

// 4. Security headers and audit logging
app.use(securityMiddleware);
app.use(securityAuditMiddleware);

// 5. Rate limiting for API routes
app.use('/api', globalRateLimit);

// 6. Rate limit info middleware (adds headers to responses)
app.use(rateLimitInfoMiddleware);

// Database: use the shared pool only. A stand-alone mysql.createConnection() used to live here;
// when MySQL restarted, its unhandled 'error' event (ECONNRESET) crashed the whole server.
// The pool drops broken connections and reconnects on the next query instead.
const { pool: dbPool } = require('./config/database');

dbPool.query('SELECT 1')
    .then(() => {
        console.log(`✅ Successfully connected to MySQL Database (Port ${process.env.DB_PORT})!`);
        console.log(`📊 Database: ${process.env.DB_NAME} | Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    })
    .catch((err) => {
        console.error(`❌ MySQL Database Connection Error (Port ${process.env.DB_PORT}):`, err.message);
        console.error('Connection Details:', {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT
        });
        // Keep running in development: requests will work again as soon as MySQL is back
        if (process.env.NODE_ENV === 'production') {
            process.exit(1);
        }
    });

// Health check endpoint
// API status (moved under /api so that '/' can serve the web app in production)
app.get('/api', (req, res) => {
    res.json({ 
        message: 'THCT Clinic API is running successfully!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// Lightweight health check used by the frontend network-status hook (GET /api/health)
app.get('/api/health', async (req, res) => {
    try {
        await require('./config/database').pool.query('SELECT 1');
        res.json({ success: true, status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        res.status(503).json({ success: false, status: 'degraded', database: 'disconnected' });
    }
});

/**
 * Route Configuration with Authentication Middleware
 * 
 * Task 5.3 Implementation:
 * - /api/auth routes configured with rate limiting and validation
 * - /api/appointments routes protected with authentication middleware
 * - /api/users routes configured with role-based access control
 * 
 * Requirements validated:
 * - 8.1: Auth middleware protects all appointment endpoints requiring authentication
 * - 8.2: Auth middleware allows access to public endpoints without token
 * - 8.3: Return 401 with "Token not provided" when API receives request without token
 * - 8.4: Return 401 with "Invalid token" when API receives invalid token
 */

// Import route modules
const appointmentRoutes = require('./routes/appointmentRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const medicalRecordsRoutes = require('./routes/medicalRecordsRoutes');
const queueRoutes = require('./routes/queueRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const doctorLeavesRoutes = require('./routes/doctorLeavesRoutes');
const notificationsRoutes = require('./routes/notificationsRoutes');
const reviewsRoutes = require('./routes/reviewsRoutes');
const medicinesRoutes = require('./routes/medicinesRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const doctorShiftsRoutes = require('./routes/doctorShiftsRoutes');
const doctorDirectoryRoutes = require('./routes/doctorDirectoryRoutes');
const prescriptionTemplatesRoutes = require('./routes/prescriptionTemplatesRoutes');

// Apply routes with authentication middleware
app.use('/api/appointments', appointmentRoutes); // Protected endpoints with auth middleware
app.use('/api/auth', authRoutes);                // Public and protected auth endpoints
app.use('/api/users', userRoutes);               // Protected user management endpoints
app.use('/api/medical-records', medicalRecordsRoutes); // Medical records endpoints with role-based access
app.use('/api/queue', queueRoutes);              // Queue management and tracking endpoints
app.use('/api/statistics', statisticsRoutes);    // Statistics and reporting endpoints (admin only)
app.use('/api/admin', adminRoutes);              // Admin management endpoints (admin role required)
app.use('/api/payments', paymentRoutes);         // Payment processing and transaction management
app.use('/api/doctor-leaves', doctorLeavesRoutes);      // Doctor days off (blocks bookings)
app.use('/api/notifications', notificationsRoutes);    // In-app notifications (bell)
app.use('/api/reviews', reviewsRoutes);                // Patient reviews of finished visits
app.use('/api/medicines', medicinesRoutes);            // Medicine catalogue & stock (kho thuốc)
app.use('/api/recommendations', recommendationRoutes);   // Smart appointment recommendation
app.use('/api/doctor-shifts', doctorShiftsRoutes);       // Doctor shifts (ca trực) -> bookable slots
app.use('/api/doctors', doctorDirectoryRoutes);         // Public doctor / specialty search (use case 3.2.2.3)
app.use('/api/prescription-templates', prescriptionTemplatesRoutes); // Doctor's saved prescriptions (đơn thuốc mẫu)

// Legacy departments endpoint (consider moving to appointmentRoutes)
app.get('/api/departments', async (req, res) => {
    try {
        const [results] = await dbPool.query('SELECT * FROM departments');
        res.json({
            success: true,
            departments: results
        });
    } catch (err) {
        console.error('Database query error:', err);
        res.status(500).json({
            success: false,
            error: {
                code: 'DATABASE_ERROR',
                message: 'Failed to retrieve departments'
            }
        });
    }
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err);
    
    // JWT specific errors
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            error: {
                code: 'TOKEN_INVALID',
                message: 'Invalid token'
            }
        });
    }
    
    // Database errors
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        return res.status(503).json({
            success: false,
            error: {
                code: 'DATABASE_UNAVAILABLE',
                message: 'Database connection lost'
            }
        });
    }
    
    // Generic server error
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: process.env.NODE_ENV === 'production' 
                ? 'Internal server error' 
                : err.message
        }
    });
});

// Production: the same server also serves the React app (frontend/build), so the whole
// system runs on one domain with HTTPS (camera QR scanning and the PWA need HTTPS).
const path = require('path');
const fs = require('fs');
const frontendBuild = process.env.FRONTEND_BUILD_DIR || path.join(__dirname, '..', '..', 'frontend', 'build');
if (fs.existsSync(path.join(frontendBuild, 'index.html'))) {
  app.use(express.static(frontendBuild, {
    index: false,
    setHeaders: (res, file) => {
      // hashed bundles can be cached for a long time; index/sw/manifest must stay fresh
      if (/\.[0-9a-f]{8,}\.(js|css)$/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(frontendBuild, 'index.html'));
  });
  console.log(`🌐 Serving frontend from ${frontendBuild}`);
}

// 404 Handler for unmatched routes
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'ROUTE_NOT_FOUND',
            message: `Route ${req.method} ${req.originalUrl} not found`
        }
    });
});

// Graceful shutdown handling
const shutdown = (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    dbPool.end()
        .catch(() => undefined)
        .then(() => {
            console.log('Database connection closed');
            process.exit(0);
        });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 THCT Clinic API Server running at http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔐 Authentication: JWT with ${process.env.JWT_EXPIRES_IN || '24h'} expiration`);
    console.log(`🛡️  Security: Rate limiting and IP blocking enabled`);
    // cancel online-transfer bookings whose payment hold has expired (checked every minute)
    require('./jobs/paymentHoldJob').startPaymentHoldJob();
});