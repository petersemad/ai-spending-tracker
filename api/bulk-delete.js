import { Pool } from 'pg';

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(request, response) {
    if (request.method !== 'POST' && request.method !== 'DELETE') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { ids, password } = request.body;
    
    // Default PIN is 1234, configurable via Vercel env variables
    const adminPass = process.env.ADMIN_PASSWORD || '1234';

    if (password !== adminPass) {
        return response.status(401).json({ error: 'Unauthorized: Incorrect PIN' });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
        return response.status(400).json({ error: 'Bad Request: Missing or empty ids array' });
    }

    try {
        if (!connectionString) {
            return response.status(500).json({ error: "Database URL missing on server" });
        }

        await pool.query(`DELETE FROM transactions WHERE id = ANY($1::int[])`, [ids]);

        response.status(200).json({ success: true, count: ids.length });
    } catch (error) {
        console.error("Database bulk delete error:", error);
        response.status(500).json({ error: error.message });
    }
}
