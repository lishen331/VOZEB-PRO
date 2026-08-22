import { Agent, fetch as undiciFetch } from "undici";

import { GENERATION_TRANSPORT_TIMEOUT_MS } from "@/lib/server/generation-http-lifecycle";
import { toUndiciRequestBody } from "@/lib/server/undici-request-body";

const internalDispatcher = new Agent({
    headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
    bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
});

export function resolveInternalOrigin(publicOrigin: string) {
    const publicUrl = parseOrigin(publicOrigin);
    const configured = normalizeOrigin(process.env.VOZEB_PRO_INTERNAL_ORIGIN || "");
    if (configured) {
        // In local development the browser may reach a different Next dev port
        // than the stale port in .env.local. Keep internal callbacks on the
        // instance that handled the request when both origins are loopback.
        const configuredUrl = parseOrigin(configured);
        if (configuredUrl && publicUrl && isLoopbackHost(configuredUrl.hostname) && isLoopbackHost(publicUrl.hostname) && effectivePort(configuredUrl) !== effectivePort(publicUrl)) {
            return publicUrl.origin;
        }
        return configured;
    }

    if (publicUrl && isLoopbackHost(publicUrl.hostname)) return publicUrl.origin;
    if (process.env.VERCEL === "1") return publicUrl?.origin || publicOrigin;

    const port = process.env.PORT?.trim();
    if (port) return `http://127.0.0.1:${port}`;
    return publicUrl?.origin || "http://127.0.0.1:3000";
}

export function isInternalApiBaseUrl(baseUrl: string) {
    return baseUrl.trim().startsWith("/");
}

export async function fetchInternalApi(input: string | URL, init?: RequestInit): Promise<Response> {
    const body = await toUndiciRequestBody(init?.body);
    return undiciFetch(input, { ...init, body, dispatcher: internalDispatcher } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
}

function normalizeOrigin(value: string) {
    const parsed = parseOrigin(value.trim().replace(/\/+$/, ""));
    return parsed && (parsed.protocol === "http:" || parsed.protocol === "https:") ? parsed.origin : "";
}

function parseOrigin(value: string) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isLoopbackHost(hostname: string) {
    const host = hostname.toLowerCase();
    // 0.0.0.0 is a listen/bind address, but local browsers can use it as the
    // request Host. Treat it like loopback so a stale configured port cannot
    // hijack internal callbacks during development.
    return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
}

function effectivePort(url: URL) {
    return Number(url.port || (url.protocol === "https:" ? 443 : 80));
}
