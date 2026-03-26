import { pool, requireAuth } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'POST' && request.method !== 'DELETE') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!requireAuth(request, response)) return;

    const { ids } = request.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return response.status(400).json({ error: 'Bad Request: Missing or empty ids array' });
    }

    try {
        await pool.query(`DELETE FROM transactions WHERE id = ANY($1::int[])`, [ids]);
        response.status(200).json({ success: true, count: ids.length });
    } catch (error) {
        console.error("Database bulk delete error:", error);
        response.status(500).json({ error: error.message });
    }
}
