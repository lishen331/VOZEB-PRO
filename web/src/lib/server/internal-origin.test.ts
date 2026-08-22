import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ agentOptions: {} as Record<string, unknown> }));

vi.mock("undici", () => ({
    Agent: class {
        constructor(options: Record<string, unknown>) {
            mocks.agentOptions = options;
        }
    },
    fetch: vi.fn(),
}));

import { GENERATION_TRANSPORT_TIMEOUT_MS } from "./generation-http-lifecycle";
import { resolveInternalOrigin } from "./internal-origin";

describe("internal API dispatcher", () => {
    it("outlives the longest model request instead of using Undici's five minute default", () => {
        expect(mocks.agentOptions).toMatchObject({
            headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
            bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
        });
    });

    it("follows the request port when a stale loopback origin is configured", () => {
        vi.stubEnv("VOZEB_PRO_INTERNAL_ORIGIN", "http://127.0.0.1:3000");
        expect(resolveInternalOrigin("http://localhost:3002")).toBe("http://localhost:3002");
        expect(resolveInternalOrigin("http://0.0.0.0:3002")).toBe("http://0.0.0.0:3002");
    });

    it("keeps an explicitly configured non-loopback origin", () => {
        vi.stubEnv("VOZEB_PRO_INTERNAL_ORIGIN", "https://internal.example.test");
        expect(resolveInternalOrigin("http://localhost:3002")).toBe("https://internal.example.test");
    });
});
