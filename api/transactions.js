import { pool } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (request.query.password !== adminPassword) {
        return response.status(401).json({ error: 'Unauthorized', message: 'Invalid session PIN.' });
    }

    try {


        // Ensure table exists (in case get is called before any webhook)
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

        const result = await pool.query(`SELECT * FROM transactions ORDER BY id DESC`);
        response.status(200).json({ transactions: result.rows });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
