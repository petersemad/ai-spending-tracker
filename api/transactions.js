import { pool, requireAuth } from './_db.js';

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }
    
    if (!requireAuth(request, response)) return;

    try {
        const result = await pool.query(`SELECT * FROM transactions ORDER BY id DESC LIMIT 2500`);
        response.status(200).json({ transactions: result.rows });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
