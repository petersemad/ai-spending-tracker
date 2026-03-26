import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { pool, requireAuth, initSchema } from './db.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { action } = req.body;
    
    // Auth Check for Registration actions
    if (['generate-reg', 'verify-reg', 'list-passkeys', 'delete-passkey'].includes(action)) {
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
                const info = verification.registrationInfo;
                const publicKey = info.credential ? info.credential.publicKey : info.credentialPublicKey;
                const rawId = info.credential ? info.credential.id : info.credentialID;
                const counter = info.credential ? info.credential.counter : info.counter;
                const transports = info.credential ? info.credential.transports : [];
                
                const pubKeyBuffer = Buffer.from(publicKey);
                const credentialIDString = typeof rawId === 'string' ? rawId : Buffer.from(rawId).toString('base64url');

                await pool.query(
                    `INSERT INTO passkeys (id, public_key, counter, transports) VALUES ($1, $2, $3, $4)
                     ON CONFLICT (id) DO UPDATE SET public_key = EXCLUDED.public_key, counter = EXCLUDED.counter`, 
                    [credentialIDString, pubKeyBuffer, counter, JSON.stringify(transports || [])]
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
            const credConfig = {
                id: credential.id,
                credentialID: Buffer.from(credential.id, 'base64url'), // v9 legacy mapping
                publicKey: authenticator.public_key,
                credentialPublicKey: authenticator.public_key, // v9 legacy mapping
                counter: Number(authenticator.counter),
                transports: JSON.parse(authenticator.transports || '[]')
            };

            const verification = await verifyAuthenticationResponse({
                response: credential,
                expectedChallenge: challengeRes.rows[0].challenge,
                expectedOrigin: origin,
                expectedRPID: rpID,
                credential: credConfig,        // v13 compliance
                authenticator: credConfig      // v9 compliance fallback
            });

            if (verification.verified) {
                const newCounter = verification.authenticationInfo.newCounter;
                await pool.query(`UPDATE passkeys SET counter = $1 WHERE id = $2`, [newCounter, credential.id]);
                return res.status(200).json({ success: true, pin: process.env.ADMIN_PASSWORD });
            }
            return res.status(400).json({ error: 'Biometric verification failed.' });
        }

        if (action === 'list-passkeys') {
            const result = await pool.query('SELECT id, counter, transports FROM passkeys');
            return res.status(200).json({ success: true, passkeys: result.rows });
        }

        if (action === 'delete-passkey') {
            const { id } = req.body;
            if (!id) return res.status(400).json({ error: 'Missing Passkey ID targeting block.' });
            await pool.query('DELETE FROM passkeys WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown action parameter.' });
    } catch (error) {
        console.error("Passkey Handler Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error', stack: error.stack });
    }
}
