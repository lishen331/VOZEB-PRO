import { defineConfig } from "@playwright/test";

// Intentionally independent: no auth setup, database fixtures, workers or global e2e preparation.
export default defineConfig({
    testDir: "./e2e",
    testMatch: "ui-showcase.spec.ts",
    outputDir: "../output/ui-showcase",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: "list",
    use: {
        baseURL: process.env.VOZEB_UI_BASE_URL || "http://127.0.0.1:64389",
        browserName: "chromium",
        viewport: { width: 1440, height: 1000 },
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
    },
});
