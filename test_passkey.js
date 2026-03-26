const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.storage_POSTGRES_URL || process.env.DATABASE_URL);

async function addDummyPasskey() {
    try {
        await sql`INSERT INTO passkeys (id, public_key, counter, transports) VALUES ('dummy_key_123', '\\x01020304', 1, '["internal"]') ON CONFLICT DO NOTHING`;
        console.log("Dummy key inserted.");
    } catch (e) {
        console.error(e);
    }
}
addDummyPasskey();
