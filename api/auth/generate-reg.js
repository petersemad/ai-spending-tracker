import { generateRegistrationOptions } from '@simplewebauthn/server';
import { pool, requireAuth } from '../db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    // Auth Check
    if (!requireAuth(req, res)) return;

    try {
        const rpName = 'AI Spending Tracker';
        const rawHost = process.env.VERCEL_URL || req.headers.host || 'localhost:3000';
        const rpID = rawHost.includes('localhost') ? 'localhost' : rawHost.replace('https://', '').split(':')[0];

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userID: Buffer.from('admin-user'),
            userName: 'admin',
            attestationType: 'none',
            authenticatorSelection: {
                residentKey: 'required',
                userVerification: 'required',
            },
        });
        
        // Save challenge securely in Postgres mapped to a unique session token
        const challengeId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await pool.query(
            `INSERT INTO webauthn_challenges (id, challenge) VALUES ($1, $2)`, 
            [challengeId, options.challenge]
        );
        
        return res.status(200).json({ options, challengeId });
    } catch (error) {
        console.error("Passkey Registration Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
