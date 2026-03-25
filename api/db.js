import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.storage_POSTGRES_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

export const pool = new Pool({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});
