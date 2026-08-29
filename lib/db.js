import { neon } from '@neondatabase/serverless';

if (!process.env.Neon_Connect) {
    throw new Error('Neon_Connect environment variable is missing');
}

const sql = neon(process.env.Neon_Connect);

export default sql;
