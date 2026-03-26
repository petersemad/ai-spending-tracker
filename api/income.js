import { pool, requireAuth } from './db.js';

export default async function handler(request, response) {
    if (!requireAuth(request, response)) return;

    try {
        if (request.method === 'GET') {
            const result = await pool.query(`SELECT * FROM income_sources ORDER BY id ASC`);
            return response.status(200).json({ income_sources: result.rows });
        }
        
        if (request.method === 'POST') {
            const { source_name, amount, currency } = request.body;
            const parsedAmount = parseFloat(amount);

            if (!source_name || isNaN(parsedAmount)) {
                return response.status(400).json({ success: false, error: 'Missing source_name or valid numerical amount' });
            }

            await pool.query(`
                INSERT INTO income_sources (source_name, amount, currency) 
                VALUES ($1, $2, $3)
                ON CONFLICT (source_name) 
                DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
            `, [source_name, parsedAmount, currency || 'EGP']);

            return response.status(200).json({ success: true });
        }

        if (request.method === 'DELETE') {
            const { source_name } = request.body;

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
