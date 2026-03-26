import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { pool, requireAuth, initSchema } from './db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action } = req.body;
    
    // Auth Check for Registration actions
    if (action === 'generate-reg' || action === 'verify-reg') {
        if (!requireAuth(req, res)) return;
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const rpID = host.split(':')[0];
    const origin = req.headers.origin || (rpID === 'localhost' ? 'http://localhost:3000' : `https://${rpID}`);

    try {
        // Enforce strong synchronization strictly before interacting with new tables inside Vercel cold instances
        await initSchema();
        
        if (action === 'generate-reg') {
            const options = await generateRegistrationOptions({
                rpName: 'AI Spending Tracker',
                rpID,
                userID: Buffer.from('admin-user'),
                userName: 'admin',
                attestationType: 'none',
                authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
            });
            const challengeId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await pool.query(`INSERT INTO webauthn_challenges (id, challenge) VALUES ($1, $2)`, [challengeId, options.challenge]);
            return res.status(200).json({ options, challengeId });
        }

        if (action === 'verify-reg') {
            const { challengeId, credential } = req.body;
            if (!challengeId || !credential) return res.status(400).json({ error: 'Missing challenge ID or credential payload.' });

            const challengeRes = await pool.query(`DELETE FROM webauthn_challenges WHERE id = $1 RETURNING challenge`, [challengeId]);
            if (challengeRes.rows.length === 0) return res.status(400).json({ error: 'Registration session expired or invalid.' });
            
            const expectedChallenge = challengeRes.rows[0].challenge;
            const verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
            });

            if (verification.verified && verification.registrationInfo) {
                const { credential, credentialDeviceType } = verification.registrationInfo;
                const { id, publicKey, counter, transports } = credential;
                
                const pubKeyBuffer = Buffer.from(publicKey);
                const credentialIDString = id;

                await pool.query(
                    `INSERT INTO passkeys (id, public_key, counter, transports) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, counter = EXCLUDED.counter`, 
                    [credentialIDString, pubKeyBuffer, counter, JSON.stringify(credential.response.transports || [])]
                );
                return res.status(200).json({ success: true });
            }
            return res.status(400).json({ error: 'Verification failed computationally.' });
        }

        if (action === 'generate-auth') {
            const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
            const challengeId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            await pool.query(`INSERT INTO webauthn_challenges (id, challenge) VALUES ($1, $2)`, [challengeId, options.challenge]);
            return res.status(200).json({ options, challengeId });
        }

        if (action === 'verify-auth') {
            const { challengeId, credential } = req.body;
            if (!challengeId || !credential) return res.status(400).json({ error: 'Missing challenge ID or credential payload.' });

            const challengeRes = await pool.query(`DELETE FROM webauthn_challenges WHERE id = $1 RETURNING challenge`, [challengeId]);
            if (challengeRes.rows.length === 0) return res.status(400).json({ error: 'Authentication session expired or invalid.' });
            
            const dbCredRes = await pool.query(`SELECT public_key, counter, transports FROM passkeys WHERE id = $1`, [credential.id]);
            if (dbCredRes.rows.length === 0) return res.status(400).json({ error: 'Authenticator is not registered with this account.' });
            
            const authenticator = dbCredRes.rows[0];
            const verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge: challengeRes.rows[0].challenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: {
                    id: credential.id,
                    publicKey: authenticator.public_key,
                    counter: Number(authenticator.counter),
                    transports: JSON.parse(authenticator.transports || '[]')
                }
            });

            if (verification.verified) {
                await pool.query(`UPDATE passkeys SET counter = $1 WHERE id = $2`, [verification.authenticationInfo.newCounter, credential.id]);
                return res.status(200).json({ success: true, pin: process.env.ADMIN_PASSWORD });
            }
            return res.status(400).json({ error: 'Biometric verification failed.' });
        }

        return res.status(400).json({ error: 'Unknown action parameter.' });
    } catch (error) {
        console.error("Passkey Handler Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error', stack: error.stack });
    }
}
