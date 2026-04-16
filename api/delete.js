import { pool, requireAuth } from './_db.js';

export default async function handler(request, response) {
    if (request.method !== 'DELETE') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!requireAuth(request, response)) return;

    const { id } = request.body;

    try {
        await pool.query(`DELETE FROM transactions WHERE id = $1`, [id]);
        response.status(200).json({ success: true });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
