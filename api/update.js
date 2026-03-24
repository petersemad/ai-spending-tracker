import { Pool } from 'pg';

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(request, response) {
    if (request.method !== 'PATCH') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { id, password, ...fieldsToUpdate } = request.body;
    
    const adminPass = process.env.ADMIN_PASSWORD || '1234';

    if (password !== adminPass) {
        return response.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    if (!id || Object.keys(fieldsToUpdate).length === 0) {
        return response.status(400).json({ error: 'id and at least one field to update are required' });
    }

    try {
        if (!connectionString) {
            return response.status(500).json({ error: "Database URL missing on server" });
        }

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
