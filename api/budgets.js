import { Pool } from 'pg';

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(request, response) {
    try {
        if (!connectionString) {
            return response.status(500).json({ error: "Database URL missing on server" });
        }

        // Ensure table exists on the fly
        await pool.query(`CREATE TABLE IF NOT EXISTS budgets (
            category VARCHAR(255) PRIMARY KEY,
            amount DECIMAL(10,2),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);

        if (request.method === 'GET') {
            if (request.query.password !== (process.env.ADMIN_PASSWORD || '1234')) return response.status(401).json({ error: 'Unauthorized PIN' });
            const result = await pool.query(`SELECT * FROM budgets`);
            return response.status(200).json({ budgets: result.rows });
        } 
        
        if (request.method === 'POST') {
            const { category, amount, currency, password } = request.body;
            
            const expectedPin = process.env.ADMIN_PASSWORD || '1234';
            if (password !== expectedPin) {
                return response.status(401).json({ success: false, error: 'Unauthorized: Incorrect PIN' });
            }

            if (!category || amount === undefined) {
                return response.status(400).json({ success: false, error: 'Missing category or amount' });
            }

            await pool.query(`
                INSERT INTO budgets (category, amount, currency) 
                VALUES ($1, $2, $3)
                ON CONFLICT (category) 
                DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
            `, [category, amount, currency || 'EGP']);

            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("Database error:", error);
        return response.status(500).json({ error: error.message });
    }
}
