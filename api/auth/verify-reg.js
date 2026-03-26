import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { pool, requireAuth } from '../db.js';

const rpID = process.env.VERCEL_URL ? process.env.VERCEL_URL.replace('https://', '') : 'localhost';
const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    // Auth Check
    if (!requireAuth(req, res)) return;

    try {
        const { body } = req;
        const { challengeId, credential } = body;

        if (!challengeId || !credential) {
            return res.status(400).json({ error: 'Missing challenge ID or credential payload.' });
        }

        // Retrieve expected challenge from DB and delete it (single use)
        const challengeRes = await pool.query(`DELETE FROM webauthn_challenges WHERE id = $1 RETURNING challenge`, [challengeId]);
        if (challengeRes.rows.length === 0) {
            return res.status(400).json({ error: 'Registration session expired or invalid.' });
        }
        
        const expectedChallenge = challengeRes.rows[0].challenge;

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });
        } catch (error) {
            console.error(error);
            return res.status(400).json({ error: error.message });
        }

        const { verified, registrationInfo } = verification;

        if (verified && registrationInfo) {
            const { credentialID, credentialPublicKey, counter } = registrationInfo;
            
            // Encode binary arrays as Buffer for Postgres BYTEA
            const pubKeyBuffer = Buffer.from(credentialPublicKey);
            const credentialIDString = Buffer.from(credentialID).toString('base64url');

            await pool.query(
                `INSERT INTO passkeys (id, public_key, counter, transports) VALUES ($1, $2, $3, $4)
                 ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, counter = EXCLUDED.counter`, 
                [credentialIDString, pubKeyBuffer, counter, JSON.stringify(credential.response.transports || [])]
            );

            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Verification failed computationally.' });
    } catch (error) {
        console.error("Passkey Verify Registration Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
