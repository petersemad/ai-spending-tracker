import { Pool } from 'pg';

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
    try {
        if (!connectionString) return res.status(500).json({ error: "Database URL missing on server" });

        await pool.query(`CREATE TABLE IF NOT EXISTS recurring_vendors (
            vendor VARCHAR(255) PRIMARY KEY,
            amount DECIMAL(10,2),
            category VARCHAR(255),
            currency VARCHAR(10) DEFAULT 'EGP'
        )`);

        try { await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN amount DECIMAL(10,2)`); } catch(e){}
        try { await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN category VARCHAR(255)`); } catch(e){}
        try { await pool.query(`ALTER TABLE recurring_vendors ADD COLUMN currency VARCHAR(10) DEFAULT 'EGP'`); } catch(e){}

        if (req.method === 'GET') {
            if (req.query.password !== (process.env.ADMIN_PASSWORD || '1234')) return res.status(401).json({ error: 'Unauthorized PIN' });
            const result = await pool.query('SELECT * FROM recurring_vendors');
            return res.status(200).json({ vendors: result.rows });
        }
        
        if (req.method === 'POST') {
            const { vendor, amount, category, currency, password } = req.body;
            if (password !== (process.env.ADMIN_PASSWORD || '1234')) return res.status(401).json({ error: 'Unauthorized PIN' });
            
            await pool.query(`
                INSERT INTO recurring_vendors (vendor, amount, category, currency) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (vendor) DO UPDATE SET amount = EXCLUDED.amount, category = EXCLUDED.category, currency = EXCLUDED.currency
            `, [vendor, amount || 0, category || 'Subscription', currency || 'EGP']);
            return res.status(200).json({ success: true });
        }
        
        if (req.method === 'DELETE') {
            const { vendor, password } = req.body;
            if (password !== (process.env.ADMIN_PASSWORD || '1234')) return res.status(401).json({ error: 'Unauthorized PIN' });
            
            await pool.query('DELETE FROM recurring_vendors WHERE vendor = $1', [vendor]);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
