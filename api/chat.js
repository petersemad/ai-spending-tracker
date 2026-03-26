import { pool, requireAuth } from './db.js';

export default async function handler(request, response) {
    if (request.method !== 'POST') return response.status(405).json({ error: 'Method Not Allowed' });
    if (!requireAuth(request, response)) return;

    try {
        const { query } = request.body;
        if (!query) return response.status(400).json({ error: 'Missing query' });

        // Pull last 1000 transactions to save token context
        const result = await pool.query(`SELECT id, amount, currency, type, vendor, category, date FROM transactions ORDER BY date DESC LIMIT 1000`);
        
        let txText = "Transactions Data:\\n";
        result.rows.forEach(t => {
            txText += `[${t.date.toISOString().slice(0,10)}] ${t.type} ${t.amount} ${t.currency} | Vendor: ${t.vendor} | Cat: ${t.category}\\n`;
        });

        const systemPrompt = `You are an elite automated financial assistant analyzing a user's categorised bank SMS transactions. 
Use strictly the JSON transaction context provided to calculate exact mathematical answers about their spending habits, limits, and totals. 
Do not hallucinate. Provide concise, friendly answers and format currencies elegantly.

${txText}`;

        const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: query }
                ],
                temperature: 0.1,
                max_tokens: 500
            })
        });

        const gptData = await openAIResponse.json();
        
        if (gptData.choices && gptData.choices.length > 0) {
            return response.status(200).json({ answer: gptData.choices[0].message.content });
        } else {
            console.error("OpenAI Error:", gptData);
            return response.status(500).json({ error: 'LLM returned empty or error response' });
        }
    } catch (error) {
        console.error("Chat API error:", error);
        return response.status(500).json({ error: error.message });
    }
}
