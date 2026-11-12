import pg from "pg";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query("SELECT username, email, role, status, (mfa_enabled_at IS NOT NULL) AS mfa, last_login_at FROM vozeb_pro_users WHERE role = 'admin' ORDER BY created_at LIMIT 10");
console.table(rows);
const { rows: [count] } = await client.query("SELECT count(*)::int AS users FROM vozeb_pro_users");
console.log(count);
await client.end();
