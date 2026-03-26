import { generateRegistrationOptions } from '@simplewebauthn/server';

async function test() {
    try {
        const options = await generateRegistrationOptions({
            rpName: 'AI Spending Tracker',
            rpID: 'localhost',
            userID: Buffer.from('admin-user'),
            userName: 'admin',
            attestationType: 'none',
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        });
        console.log("SUCCESS:", Object.keys(options));
    } catch (e) {
        console.error("FAILED:", e);
    }
}
test();
