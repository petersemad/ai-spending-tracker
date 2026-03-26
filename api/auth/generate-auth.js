import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { pool } from '../db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const rawHost = process.env.VERCEL_URL || req.headers.host || 'localhost:3000';
        const rpID = rawHost.includes('localhost') ? 'localhost' : rawHost.replace('https://', '').split(':')[0];

        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'required',
            // allowing empty allowCredentials natively invokes Discoverable Passkeys (TouchID/FaceID)
        });
        
        // Save challenge securely in Postgres mapped to a unique session token
        const challengeId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        await pool.query(
            `INSERT INTO webauthn_challenges (id, challenge) VALUES ($1, $2)`, 
            [challengeId, options.challenge]
        );
        
        return res.status(200).json({ options, challengeId });
    } catch (error) {
        console.error("Passkey Generate Auth Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
