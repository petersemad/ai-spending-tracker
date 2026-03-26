import { pool } from './db.js';import { OpenAI } from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});



const SYSTEM_PROMPT = `
You are a financial assistant parsing CIB bank SMS messages.
You must ONLY process messages that match one of these valid formats:

English Purchase ("Your credit card... was charged...")
Arabic Debit Purchase ("تم خصم مبلغ...")
Instant Transfer Outgoing ("تم تنفيذ تحويل لحظي بمبلغ... من حسابك...")
Instant Transfer Incoming ("تم تنفيذ تحويل لحظي بمبلغ... إلى حسابك...")
ATM Withdrawal ("تم سحب مبلغ...")
Refund / Reversal ("تم اضافة المعاملة...")

CRITICAL RULES:
If the message is a Transaction Declined ("تم رفض المعاملة") or mentions insufficient funds, return {"ignore": true}
If the message does not match any of the above formats (for example OTP, marketing, reminders, general notifications), return {"ignore": true}
Treat every message starting with "تم اضافة المعاملة" as a refund/reversal, meaning money came back to the account/card
Therefore, any "تم اضافة المعاملة" message must always be classified as: type = "In"

If valid, extract the data and return ONLY a valid JSON object with these EXACT keys:
amount: number, the monetary amount extracted
currency: string, the currency of the transaction (e.g., "EGP", "USD"). Default to "EGP" if not explicitly mentioned.
type: string, exactly "In" or "Out"
vendor: string, the merchant, "ATM", or sender/receiver name
category: string, pick the BEST fitting category from this list based on the merchant name:
  - "Transport" for Uber, Careem, SWVL, taxi, fuel stations, parking
  - "Food & Drink" for restaurants, cafes, Starbucks, McDonald's, KFC, Breadfast, Talabat, elmenus
  - "Groceries" for supermarkets like Carrefour, Kazyon, Seoudi, Hyper One, Gourmet
  - "Shopping" for Amazon, Noon, Jumia, SHEIN, Zara, H&M, retail stores
  - "Entertainment" for Netflix, Spotify, YouTube, Apple, Google Play, cinema, gaming
  - "Utilities" for Vodafone, Etisalat, Orange, WE, electricity, gas, water bills
  - "Health" for pharmacies, hospitals, clinics, labs
  - "Education" for schools, universities, courses, Udemy, Coursera
  - "Transfer" for person-to-person instant transfers
  - "ATM" for ATM withdrawals
  - "Subscription" for recurring app/service charges (MacroDroid, iCloud, etc.)
  - "Refund" for reversed or refunded transactions
  - "Other" if none of the above fit
  CRITICAL: After the category, append " (Credit)" if the original SMS was in English, or " (Debit)" if the SMS was in Arabic.
  Example: "Transport (Credit)" or "Food & Drink (Debit)"

Classification rules:
English Purchase ("Your credit card... was charged...") -> type = "Out"
Arabic Debit Purchase ("تم خصم مبلغ...") -> type = "Out"
Instant Transfer Outgoing ("تم تنفيذ تحويل لحظي بمبلغ... من حسابك...") -> type = "Out"
Instant Transfer Incoming ("تم تنفيذ تحويل لحظي بمبلغ... إلى حسابك...") -> type = "In"
ATM Withdrawal ("تم سحب مبلغ...") -> type = "Out"
Refund / Reversal ("تم اضافة المعاملة...") -> type = "In"

Do not wrap the JSON in markdown code blocks.
`;

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    const { message } = request.body;
    
    if (!message) {
        return response.status(400).json({ error: "No message provided" });
    }

    console.log("Received new SMS:", message);

    try {
        if (!process.env.OPENAI_API_KEY) {
            console.error("No OpenAI API key found in .env");
            return response.status(500).json({ error: "OpenAI API key missing on server" });
        }


        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: message }
            ],
            temperature: 0.2
        });
        
        const content = completion.choices[0].message.content;
        const data = JSON.parse(content);
        
        console.log("AI Parsed Data:", data);
        
        // If the AI determined this is a message to ignore
        if (data.ignore) {
            console.log("Message ignored based on strict formatting rules.");
            return response.status(200).json({ success: true, message: "Message intentionally ignored." });
        }
        
        const parsedAmount = parseFloat(data.amount);
        if (isNaN(parsedAmount)) {
            console.error("Failed to mathematically parse AI amount:", data.amount);
            return response.status(200).json({ success: true, message: "AI payload dropped due to invalid numerical amount inference.", data });
        }
        
        await pool.query(
            `INSERT INTO transactions (amount, currency, type, vendor, category, raw_text) VALUES ($1, $2, $3, $4, $5, $6)`,
            [parsedAmount, data.currency || 'EGP', data.type, data.vendor, data.category, message]
        );
        
        response.status(200).json({ success: true, data });
        
    } catch (error) {
        console.error("Error processing message:", error);
        response.status(500).json({ error: "Failed to process message: " + error.message });
    }
}
