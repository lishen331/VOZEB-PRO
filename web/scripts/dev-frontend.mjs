// 前端热更新开发服务：改前端代码保存后浏览器自动更新，不用重建 Docker。
// 用法（在 web 目录）：pnpm dev:frontend      打开 http://localhost:3300
//
// - 直接连本地 Docker 里的 Postgres（.env.local 的 DATABASE_URL，经 vozeb-pg-forward 转发到 127.0.0.1:5433），
//   数据和 :3000 的 Docker 应用是同一份，登录账号也一样
// - 只起 Next 开发服务，不起生成任务 worker：生成任务继续由 Docker 里的 vozeb-pro-generation-worker 处理
// - 构建产物放 .next-hmr，和 next dev（.next-dev）、生产构建（.next）互不干扰
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.PORT?.trim() || "3300";
const envFile = path.join(webRoot, ".env.local");

if (!existsSync(envFile)) {
    console.error("缺少 web/.env.local：需要其中的 DATABASE_URL 与 VOZEB_PRO_ENCRYPTION_KEY 才能连本地数据库。");
    process.exit(1);
}

// 不能用 node --env-file：Next 会把父进程的 execArgv 塞进子进程的 NODE_OPTIONS，而 Node 不允许 NODE_OPTIONS 里出现 --env-file。
// 这里自己读 .env.local，以普通环境变量传下去（已在 shell 里设置的变量优先）。
const fileEnv = parseEnv(readFileSync(envFile, "utf8"));

const child = spawn(process.execPath, [path.join(webRoot, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", port], {
    cwd: webRoot,
    stdio: "inherit",
    env: { ...fileEnv, ...process.env, NEXT_DIST_DIR: ".next-hmr", NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=6144"].filter(Boolean).join(" ") },
});

console.log(`\n前端热更新服务启动中：http://localhost:${port}（首次打开某个页面要编译 10~40 秒，之后改代码 1~10 秒自动生效）\n`);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
