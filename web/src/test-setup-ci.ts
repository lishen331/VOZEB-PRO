/**
 * Vitest worker-process setup: 没有 DATABASE_URL 时默认 json provider，
 * 避免 channel-concurrency 等模块在 CI 里尝试连 Postgres。
 * 测试文件内部若需要测试 postgres 路径，仍可覆盖 process.env 并在 afterEach 还原。
 */
if (!process.env.VOZEB_PRO_DATABASE_PROVIDER) {
    process.env.VOZEB_PRO_DATABASE_PROVIDER = "json";
}
