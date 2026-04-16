import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

export const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

export const requireAuth = (req, res) => {
    const pin = req.headers['x-admin-pin'];
    const adminPass = process.env.ADMIN_PASSWORD;
    if (!adminPass || pin !== adminPass) {
        res.status(401).json({ error: 'Unauthorized', message: 'Invalid or missing session PIN.' });
        return false;
    }
    return true;
};

let schemaInitPromise = null;

export const initSchema = () => {
    // Only run if pool exists
    if (!pool) return Promise.resolve();
    
    if (schemaInitPromise) return schemaInitPromise;
    
    schemaInitPromise = (async () => {
        try {
        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP',
            type VARCHAR(50),
            vendor VARCHAR(255),
            category VARCHAR(255),
            raw_text TEXT,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            tags TEXT
        )`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'`).catch(() => {});
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tags TEXT`).catch(() => {});

        await pool.query(`CREATE TABLE IF NOT EXISTS budgets (
            category VARCHAR(255) PRIMARY KEY,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS recurring_vendors (
            vendor VARCHAR(255) PRIMARY KEY,
            amount DECIMAL(10,2),
            category VARCHAR(255),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);
        await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2)`).catch(() => {});
        await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN IF NOT EXISTS category VARCHAR(255)`).catch(() => {});
        await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'`).catch(() => {});

        await pool.query(`CREATE TABLE IF NOT EXISTS income_sources (
            id SERIAL PRIMARY KEY,
            source_name VARCHAR(255) UNIQUE,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS passkeys (
            id TEXT PRIMARY KEY,
            public_key BYTEA NOT NULL,
            counter BIGINT NOT NULL,
            transports TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS webauthn_challenges (
            id VARCHAR(255) PRIMARY KEY,
            challenge TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS wealth_assets (
            id SERIAL PRIMARY KEY,
            asset_name VARCHAR(255),
            asset_type VARCHAR(50),
            commodity_type VARCHAR(50),
            quantity DECIMAL(15,4),
            purchase_price DECIMAL(15,2),
            fees DECIMAL(15,2) DEFAULT 0,
            currency VARCHAR(10) DEFAULT 'USD',
            is_automated BOOLEAN DEFAULT false,
            current_manual_value DECIMAL(15,2),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS wealth_history (
            id SERIAL PRIMARY KEY,
            log_date DATE UNIQUE DEFAULT CURRENT_DATE,
            total_usd DECIMAL(15,2)
        )`);
    } catch (e) {
        console.error("Schema initialization error:", e);
    }
    })();
    return schemaInitPromise;
};

// Execute schema init automatically upon Vercel function cold start
initSchema().catch(console.error);
