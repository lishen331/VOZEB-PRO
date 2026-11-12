import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const directories = [process.env.VOZEB_PRO_E2E_DATA_DIR || ".e2e-data", process.env.VOZEB_PRO_E2E_OUTPUT_DIR || ".e2e-artifacts", process.env.VOZEB_PRO_E2E_REPORT_DIR || "playwright-report"];
for (const directory of directories) {
    const target = path.resolve(webRoot, directory);
    const withinWeb = target.startsWith(`${webRoot}${path.sep}`);
    const withinDedicatedTemp = target.startsWith(`${path.resolve(process.env.TEMP || process.env.TMP || "/tmp")}${path.sep}`) && path.basename(target).startsWith("vozeb-recovery-");
    if (!withinWeb && !withinDedicatedTemp) throw new Error(`Refusing to clear an E2E artifact path outside approved test directories: ${target}`);
    await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
