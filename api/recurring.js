import { pool, requireAuth } from './_db.js';

export default async function handler(req, res) {
    if (!requireAuth(req, res)) return;

    try {
        if (req.method === 'GET') {
            const result = await pool.query('SELECT * FROM recurring_vendors');
            return res.status(200).json({ vendors: result.rows });
        }
        
        if (req.method === 'POST') {
            const { vendor, amount, category, currency } = req.body;
            const parsedAmount = parseFloat(amount);
            
            if (!vendor) return res.status(400).json({ error: 'Missing vendor' });
            if (isNaN(parsedAmount)) return res.status(400).json({ error: 'Invalid or missing numerical amount' });
            
            await pool.query(`
                INSERT INTO recurring_vendors (vendor, amount, category, currency) 
                VALUES ($1, $2, $3, $4) 
                ON CONFLICT (vendor) DO UPDATE SET amount = EXCLUDED.amount, category = EXCLUDED.category, currency = EXCLUDED.currency
            `, [vendor, parsedAmount, category || 'Subscription', currency || 'EGP']);
            return res.status(200).json({ success: true });
        }
        
        if (req.method === 'DELETE') {
            const { vendor } = req.body;
            if (!vendor) return res.status(400).json({ error: 'Missing vendor' });
            
            await pool.query('DELETE FROM recurring_vendors WHERE vendor = $1', [vendor]);
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("Recurring error:", error);
        return res.status(500).json({ error: error.message });
    }
}
