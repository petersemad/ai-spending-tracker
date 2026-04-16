import { pool, requireAuth } from './_db.js';

export default async function handler(request, response) {
    if (!requireAuth(request, response)) return;

    try {
        if (request.method === 'GET') {
            const result = await pool.query(`SELECT to_char(log_date, 'YYYY-MM-DD') as date_str, total_usd FROM wealth_history ORDER BY log_date ASC`);
            return response.status(200).json({ success: true, history: result.rows });
        }
        
        if (request.method === 'POST') {
            const { totalUsd } = request.body;
            if (totalUsd === undefined || isNaN(parseFloat(totalUsd))) {
                return response.status(400).json({ success: false, error: 'Missing totalUsd' });
            }

            // Upsert today's total wealth
            await pool.query(
                `INSERT INTO wealth_history (log_date, total_usd) 
                 VALUES (CURRENT_DATE, $1) 
                 ON CONFLICT (log_date) 
                 DO UPDATE SET total_usd = EXCLUDED.total_usd`,
                [parseFloat(totalUsd)]
            );

            return response.status(200).json({ success: true });
        }

        return response.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error("Wealth history API error:", e);
        return response.status(500).json({ success: false, error: e.message });
    }
}
