// 只读:查看本地库现有渠道(Key 打码)与并发预留表结构
import { readFileSync } from "node:fs";
import pg from "pg";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const read = (key) => (env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1] || "").trim();
const client = new pg.Client({ connectionString: read("DATABASE_URL") });
await client.connect();

const mask = (v) => (typeof v === "string" && v.length > 12 ? `${v.slice(0, 6)}…${v.slice(-4)} len=${v.length}` : v ? "(short)" : "(empty)");

const chan = await client.query(`select * from vozeb_pro_system_model_channels order by sort_order nulls last`);
console.log("EXISTING_CHANNELS:", chan.rowCount);
for (const r of chan.rows) {
    console.log(`- ${r.name} | base=${r.base_url} | fmt=${r.api_format} | on=${r.enabled} | key=${mask(r.api_key_ciphertext)}`);
}

const cc = await client.query(
    `select column_name, data_type from information_schema.columns where table_name='vozeb_pro_generation_concurrency_reservations' order by ordinal_position`,
);
console.log("\nCONCURRENCY_RESERVATION_COLUMNS:");
console.log(cc.rows.map((r) => `  ${r.column_name} ${r.data_type}`).join("\n") || "  (none)");

const n = await client.query(`select count(*)::int as n from vozeb_pro_generation_concurrency_reservations`);
console.log("RESERVATION_ROWS:", n.rows[0]?.n);

await client.end();
