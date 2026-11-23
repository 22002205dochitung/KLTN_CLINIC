const mysql = require('mysql2/promise');
require('dotenv').config();

/**
 * Database Configuration and Connection Pool
 * Provides centralized database connection management for the authentication system
 * Uses connection pooling for optimal performance
 */

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    
    // Connection pooling for performance optimization
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // mysql2 pool option is connectTimeout (connectionTimeout triggers an "invalid option" warning)
    // Keep the pool configuration compatible with current mysql2 behavior.
    connectTimeout: 60000,
    
    // Performance optimizations
    multipleStatements: false,
    
    // SSL only for cloud databases that require it (DB_SSL=true). A MariaDB on the same
    // server/VPS does not use TLS, so this must not depend on NODE_ENV.
    ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true' ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false'
    } : undefined,
    charset: 'utf8mb4',
    // dates stay in the server's local time zone (Vietnam), as on the development machine
    timezone: 'local'
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// MySQL 8 / TiDB enable ONLY_FULL_GROUP_BY by default; the reports were written for MariaDB
// (XAMPP), so every connection uses the same, MariaDB-like SQL mode.
if (typeof pool.on === 'function') pool.on('connection', (connection) => {
    connection.query(
        "SET SESSION sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'",
        () => undefined
    );
});
const execute = (...args) => pool.execute(...args);

const ensureTableExists = async (tableName, createSql) => {
    const [existingTables] = await pool.execute(`SHOW TABLES LIKE '${tableName}'`);
    if (existingTables.length === 0) {
        await pool.execute(createSql);
        console.log(`✅ Created missing table: ${tableName}`);
    }
};

const ensureAppointmentColumns = async () => {
    const [columns] = await pool.execute('SHOW COLUMNS FROM appointments');
    const columnNames = new Set(columns.map(column => column.Field));

    const columnAdditions = [
        {
            name: 'symptoms',
            definition: 'TEXT NULL',
            exists: columnNames.has('symptoms')
        },
        {
            name: 'consultation_fee',
            definition: 'DECIMAL(10,2) NULL',
            exists: columnNames.has('consultation_fee')
        },
        {
            name: 'payment_status',
            definition: "ENUM('unpaid', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid'",
            exists: columnNames.has('payment_status')
        },
        {
            name: 'payment_method',
            definition: "ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NULL",
            exists: columnNames.has('payment_method')
        }
    ];

    for (const column of columnAdditions) {
        if (!column.exists) {
            await pool.execute(`ALTER TABLE appointments ADD COLUMN ${column.name} ${column.definition}`);
            console.log(`✅ Added missing column to appointments: ${column.name}`);
        }
    }
};

const ensurePaymentTransactionsTable = async () => {
    const createSql = `
        CREATE TABLE IF NOT EXISTS payment_transactions (
            id INT PRIMARY KEY AUTO_INCREMENT,
            transaction_type ENUM('consultation', 'medication', 'other') NOT NULL,
            reference_id INT NOT NULL,
            patient_id INT NOT NULL,
            amount DECIMAL(10, 2) NOT NULL,
            payment_method ENUM('cash', 'bank_transfer', 'card', 'momo', 'vnpay') NOT NULL DEFAULT 'cash',
            payment_status ENUM('pending', 'completed', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
            paid_at TIMESTAMP NULL,
            notes TEXT,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_reference (transaction_type, reference_id),
            INDEX idx_patient (patient_id),
            INDEX idx_status (payment_status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await ensureTableExists('payment_transactions', createSql);
};

const ensureClinicSchemaCompatibility = async () => {
    try {
        await ensurePaymentTransactionsTable();
        await ensureAppointmentColumns();
    } catch (error) {
        console.warn('⚠️ Schema compatibility check warning:', error.message);
    }
};

// Test connection on startup
const testConnection = async () => {
    if (process.env.NODE_ENV === 'test') {
        return false;
    }

    try {
        const connection = await pool.getConnection();
        console.log('✅ Database connected successfully');
        connection.release();
        await ensureClinicSchemaCompatibility();
        return true;
    } catch (error) {
        console.warn('⚠️ Database connection check skipped or failed:', error.message);
        return false;
    }
};

// Initialize connection test
testConnection();

/**
 * Execute a database query with automatic connection handling
 * @param {String} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
const executeQuery = async (query, params = []) => {
    try {
        const [results] = await pool.execute(query, params);
        return results;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

/**
 * Execute a query and return the first result row
 * @param {String} query - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise} First row or null
 */
const queryFirst = async (query, params = []) => {
    try {
        const results = await executeQuery(query, params);
        return results.length > 0 ? results[0] : null;
    } catch (error) {
        throw error;
    }
};

/**
 * Check if database connection is healthy
 * @returns {Promise<Boolean>} Connection status
 */
const isHealthy = async () => {
    try {
        await executeQuery('SELECT 1');
        return true;
    } catch (error) {
        return false;
    }
};

/**
 * Transaction helper function
 * @param {Function} callback - Callback function that receives connection
 * @returns {Promise} Transaction result
 */
const transaction = async (callback) => {
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = {
    pool,
    execute,
    executeQuery,
    queryFirst,
    isHealthy,
    transaction,
    testConnection,
    ensureClinicSchemaCompatibility
};