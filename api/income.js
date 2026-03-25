import { pool } from './db.js';

export default async function handler(request, response) {
    try {


        await pool.query(`CREATE TABLE IF NOT EXISTS income_sources (
            id SERIAL PRIMARY KEY,
            source_name VARCHAR(255) UNIQUE,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);

        if (request.method === 'GET') {
            const expectedPin = process.env.ADMIN_PASSWORD;
            if (request.query.password !== expectedPin) return response.status(401).json({ error: 'Unauthorized PIN' });
            const result = await pool.query(`SELECT * FROM income_sources ORDER BY id ASC`);
            return response.status(200).json({ income_sources: result.rows });
        }
        
        const expectedPin = process.env.ADMIN_PASSWORD;
        
        if (request.method === 'POST') {
            const { source_name, amount, currency, password } = request.body;
            
            if (password !== expectedPin) {
                return response.status(401).json({ success: false, error: 'Unauthorized: Incorrect PIN' });
            }

            if (!source_name || amount === undefined) {
                return response.status(400).json({ success: false, error: 'Missing source_name or amount' });
            }

            await pool.query(`
                INSERT INTO income_sources (source_name, amount, currency) 
                VALUES ($1, $2, $3)
                ON CONFLICT (source_name) 
                DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
            `, [source_name, amount, currency || 'EGP']);

            return response.status(200).json({ success: true });
        }

        if (request.method === 'DELETE') {
            const { source_name, password } = request.body;
            
            if (password !== expectedPin) {
                return response.status(401).json({ success: false, error: 'Unauthorized: Incorrect PIN' });
            }

            if (!source_name) {
                return response.status(400).json({ success: false, error: 'Missing source_name' });
            }

            await pool.query(`DELETE FROM income_sources WHERE source_name = $1`, [source_name]);
            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("Database error:", error);
        return response.status(500).json({ error: error.message });
    }
}
