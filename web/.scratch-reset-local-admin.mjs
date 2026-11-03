// 本地开发库专用：重置 admin 密码，先把原哈希备份到 .scratch/
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";

const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error(`拒绝执行：数据库不是本地 (${url.hostname})`);

const password = process.argv[2];
const salt = randomBytes(16).toString("base64url");
const hash = `pbkdf2_sha256$210000$${salt}$${pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url")}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query("SELECT id, username, password_hash FROM vozeb_pro_users WHERE username = 'admin' AND role = 'admin'");
if (rows.length !== 1) throw new Error(`匹配到 ${rows.length} 个 admin，已取消`);
mkdirSync(".scratch", { recursive: true });
const backup = `.scratch/admin-password-hash-backup-${Date.now()}.json`;
writeFileSync(backup, JSON.stringify(rows[0], null, 2));

await client.query("BEGIN");
await client.query("UPDATE vozeb_pro_users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, rows[0].id]);
const sessions = await client.query("DELETE FROM vozeb_pro_sessions WHERE user_id = $1", [rows[0].id]);
await client.query("COMMIT");
await client.end();
console.log(`已重置 ${rows[0].username}，清理会话 ${sessions.rowCount} 个，原哈希备份：${backup}`);
