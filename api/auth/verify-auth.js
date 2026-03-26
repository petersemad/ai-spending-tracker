import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { pool } from '../db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { body } = req;
        const { challengeId, credential } = body;

        if (!challengeId || !credential) {
            return res.status(400).json({ error: 'Missing challenge ID or credential payload.' });
        }

        const rawHost = process.env.VERCEL_URL || req.headers.host || 'localhost:3000';
        const rpID = rawHost.includes('localhost') ? 'localhost' : rawHost.replace('https://', '').split(':')[0];
        const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

        // 1. Retrieve & Burn Challenge
        const challengeRes = await pool.query(`DELETE FROM webauthn_challenges WHERE id = $1 RETURNING challenge`, [challengeId]);
        if (challengeRes.rows.length === 0) {
            return res.status(400).json({ error: 'Authentication session expired or invalid.' });
        }
        const expectedChallenge = challengeRes.rows[0].challenge;

        // 2. Look up the credential in DB by ID
        const dbCredRes = await pool.query(`SELECT public_key, counter, transports FROM passkeys WHERE id = $1`, [credential.id]);
        if (dbCredRes.rows.length === 0) {
            return res.status(400).json({ error: 'Authenticator is not registered with this account.' });
        }
        const authenticator = dbCredRes.rows[0];

        // 3. Verify Assertion Signature
        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: {
                    id: credential.id,
                    publicKey: authenticator.public_key,
                    counter: Number(authenticator.counter),
                    transports: JSON.parse(authenticator.transports || '[]')
                }
            });
        } catch (error) {
            console.error(error);
            return res.status(400).json({ error: error.message });
        }

        const { verified, authenticationInfo } = verification;

        if (verified) {
            // Update counter to mitigate cloning
            await pool.query(`UPDATE passkeys SET counter = $1 WHERE id = $2`, [authenticationInfo.newCounter, credential.id]);
            
            // THE SECRET HANDSHAKE: Return the actual environment PIN securely.
            return res.status(200).json({ 
                success: true, 
                pin: process.env.ADMIN_PASSWORD 
            });
        }

        return res.status(400).json({ error: 'Biometric verification failed.' });
    } catch (error) {
        console.error("Passkey Verify Auth Error:", error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
