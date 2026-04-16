import { pool, requireAuth } from './_db.js';

export default async function handler(request, response) {
    if (!requireAuth(request, response)) return;

    try {
        if (request.method === 'GET') {
            const result = await pool.query(`SELECT * FROM budgets`);
            return response.status(200).json({ budgets: result.rows });
        } 
        
        if (request.method === 'POST') {
            const { category, amount, currency } = request.body;
            const parsedAmount = parseFloat(amount);

            if (!category || isNaN(parsedAmount)) {
                return response.status(400).json({ success: false, error: 'Missing category or valid numerical amount' });
            }

            await pool.query(`
                INSERT INTO budgets (category, amount, currency) 
                VALUES ($1, $2, $3)
                ON CONFLICT (category) 
                DO UPDATE SET amount = EXCLUDED.amount, currency = EXCLUDED.currency
            `, [category, parsedAmount, currency || 'EGP']);

            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method Not Allowed' });
    } catch (error) {
        console.error("Database error:", error);
        return response.status(500).json({ error: error.message });
    }
}
