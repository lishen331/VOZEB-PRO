import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;

/**
 * Probe only read-only health contracts. This intentionally does not log in,
 * create a project, submit a generation task, or call an external provider.
 */
export async function runDramaLabDeploymentSmoke({ origin, fetcher = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, requireReady = false, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    const normalizedOrigin = normalizeOrigin(origin);
    const live = await probeJson({ normalizedOrigin, pathname: "/api/health/live", fetcher, timeoutMs, retries, sleep });
    if (live.status !== 200 || live.payload?.code !== 0 || live.payload?.data?.status !== "live") {
        throw new Error(`Live health contract failed (HTTP ${live.status})`);
    }

    let ready = { skipped: true };
    if (requireReady) {
        ready = await probeJson({ normalizedOrigin, pathname: "/api/health/ready", fetcher, timeoutMs, retries, sleep });
        if (ready.status !== 200 || ready.payload?.code !== 0 || ready.payload?.data?.ready !== true) {
            const reason = ready.payload?.data?.generationWorker?.reason || ready.payload?.msg || `HTTP ${ready.status}`;
            throw new Error(`Readiness health contract failed: ${reason}`);
        }
    }

    return {
        origin: normalizedOrigin,
        live: { status: live.status, payload: live.payload },
        ready: ready.skipped ? ready : { status: ready.status, payload: ready.payload },
    };
}

export function normalizeOrigin(value = process.env.VOZEB_PRO_SMOKE_ORIGIN || `http://127.0.0.1:${process.env.PORT || "3000"}`) {
    const raw = String(value).trim();
    if (!raw) throw new Error("VOZEB_PRO_SMOKE_ORIGIN cannot be empty");
    const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Smoke origin must use HTTP or HTTPS");
    if (url.username || url.password || url.search || url.hash) throw new Error("Smoke origin must not contain credentials, query, or fragment");
    return url.origin;
}

async function probeJson({ normalizedOrigin, pathname, fetcher, timeoutMs, retries, sleep }) {
    const url = new URL(pathname, normalizedOrigin).toString();
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetcher(url, { method: "GET", cache: "no-store", signal: controller.signal });
            const payload = await response.json().catch(() => null);
            if (response.status >= 500 && attempt < retries) {
                await sleep(100 * 2 ** attempt);
                continue;
            }
            return { status: response.status, payload };
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await sleep(100 * 2 ** attempt);
                continue;
            }
        } finally {
            clearTimeout(timer);
        }
    }
    throw new Error(`Health endpoint unavailable: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function main() {
    const result = await runDramaLabDeploymentSmoke({
        origin: process.env.VOZEB_PRO_SMOKE_ORIGIN,
        requireReady: /^(1|true|yes)$/i.test(process.env.VOZEB_PRO_SMOKE_REQUIRE_READY || ""),
        timeoutMs: positiveInteger(process.env.VOZEB_PRO_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
        retries: positiveInteger(process.env.VOZEB_PRO_SMOKE_RETRIES, DEFAULT_RETRIES),
    });
    console.log(JSON.stringify({ ...result, checkedAt: new Date().toISOString() }, null, 2));
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
