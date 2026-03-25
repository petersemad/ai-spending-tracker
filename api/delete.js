import { pool } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'DELETE') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id, password } = request.body;
    
    // Required PIN configurable via env variables
    const adminPass = process.env.ADMIN_PASSWORD;

    if (password !== adminPass) {
        return response.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    try {


        await pool.query(`DELETE FROM transactions WHERE id = $1`, [id]);

        response.status(200).json({ success: true });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
