import { pool, requireAuth } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    if (!requireAuth(request, response)) return;

    const { amount, currency, type, vendor, category, date } = request.body;
    const parsedAmount = parseFloat(amount);

    if (isNaN(parsedAmount) || !type || !vendor || !category) {
        return response.status(400).json({ error: 'Missing required fields or invalid numerical amount' });
    }

    try {
        const rawText = "Manually added via dashboard";
        const txDate = date || new Date().toISOString();
        const txCurrency = currency || 'EGP';

        const result = await pool.query(
            `INSERT INTO transactions (amount, currency, type, vendor, category, raw_text, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [amount, txCurrency, type, vendor, category, rawText, txDate]
        );

        response.status(200).json({ success: true, id: result.rows[0].id });
    } catch (error) {
        console.error("Database error:", error);
        response.status(500).json({ error: error.message });
    }
}
