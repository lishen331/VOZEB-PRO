import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const { rows } = await c.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%users'");
console.log(rows, (await c.query("SELECT current_database() db")).rows[0]);
await c.end();
