import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    test: {
        include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.mjs"],
        env: {
            // CI 环境没有 Postgres，默认用 JSON provider 跑单元测试。
            // 真实 Postgres 集成测试走 pnpm test:protocols（需要 DATABASE_URL）。
            VOZEB_PRO_DATABASE_PROVIDER:
                process.env.VOZEB_PRO_DATABASE_PROVIDER ?? "json",
        },
    },
});
