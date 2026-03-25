import { pool } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { amount, currency, type, vendor, category, date, password } = request.body;
    
    const adminPass = process.env.ADMIN_PASSWORD;

    if (password !== adminPass) {
        return response.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    if (amount === undefined || !type || !vendor || !category) {
        return response.status(400).json({ error: 'Missing required fields' });
    }

    try {


        // Ensure table and currency exist
        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP',
            type VARCHAR(50),
            vendor VARCHAR(255),
            category VARCHAR(255),
            raw_text TEXT,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'`);

        const rawText = "Manually added via dashboard";
        const txDate = date || new Date().toISOString();
        const txCurrency = currency || 'EGP';

        const result = await pool.query(
            `INSERT INTO transactions (amount, currency, type, vendor, category, raw_text, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [amount, txCurrency, type, vendor, category, rawText, txDate]
        );

        response.status(200).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
