import { pool } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'PATCH') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id, password, ...fieldsToUpdate } = request.body;
    
    const adminPass = process.env.ADMIN_PASSWORD;

    if (password !== adminPass) {
        return response.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    if (!id || Object.keys(fieldsToUpdate).length === 0) {
        return response.status(400).json({ error: 'id and at least one field to update are required' });
    }

    try {


        // Auto-migrate column just in case it hits here first
        await pool.query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'EGP'`);

        // Build dynamic SET clause
        const setClauses = [];
        const values = [];
        let index = 1;

        for (const [key, value] of Object.entries(fieldsToUpdate)) {
            const allowedFields = ['amount', 'currency', 'type', 'vendor', 'category', 'date', 'raw_text'];
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = $${index}`);
                values.push(value);
                index++;
            }
        }

        if (setClauses.length === 0) {
            return response.status(400).json({ error: 'No valid fields provided for update' });
        }

        values.push(id);
        const queryText = `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${index}`;

        await pool.query(queryText, values);
        response.status(200).json({ success: true });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
