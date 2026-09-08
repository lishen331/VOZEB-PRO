import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ internal: vi.fn(), external: vi.fn() }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.internal }));
vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: mocks.external }));
vi.mock("@/lib/server/maintenance-auth", () => ({ maintenanceWorkerContextHeaders: () => ({ authorization: "Bearer worker", "x-vozeb-pro-worker-user-id": "user" }) }));
import { prepareAgentPlannerMedia } from "./agent-planner-media";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRI0AAAAASUVORK5CYII=", "base64");
const asset = { id: "image-one", type: "image" as const, serverUrl: "/api/reference-assets/image.png" };
beforeEach(() => vi.resetAllMocks());
describe("agent planner media", () => {
    it("signs owned private media for worker recovery without a browser session", async () => {
        vi.stubEnv("VOZEB_PRO_REFERENCE_ASSET_SIGNING_KEY", "unit-test-signing-key");
        try {
            mocks.internal.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
            await prepareAgentPlannerMedia([{ ...asset, userId: "user" }], "http://localhost:3001", "signed-worker", new AbortController().signal);
            const url = String(mocks.internal.mock.calls[0][0]);
            expect(url).toContain("signature=");
            expect(url).toContain("/api/reference-assets/image.png");
        } finally {
            vi.unstubAllEnvs();
        }
    });

    it("reads video bytes without relabeling them as images", async () => {
        mocks.internal.mockResolvedValue(new Response("video-bytes", { headers: { "content-type": "video/mp4" } }));
        const media = await prepareAgentPlannerMedia([{ ...asset, type: "video" }], "http://localhost:3001", "", new AbortController().signal);
        expect(media[0]).toMatchObject({ type: "video", url: expect.stringContaining("data:video/mp4;base64,") });
    });

    it("reads private images with internal authentication and produces real image content", async () => {
        mocks.internal.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
        const inputs = await prepareAgentPlannerMedia([asset], "http://localhost:3001", "signed-worker", new AbortController().signal);
        expect(inputs).toEqual([{ type: "image", url: `data:image/png;base64,${png.toString("base64")}` }]);
        expect(new Headers(mocks.internal.mock.calls[0][1].headers).get("authorization")).toBe("Bearer worker");
    });
    it("does not forward private cookies to a redirected object store", async () => {
        mocks.internal.mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://cdn.example.test/a.png" } }));
        mocks.external.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png" } }));
        await prepareAgentPlannerMedia([asset], "http://localhost:3001", "session=secret", new AbortController().signal);
        expect(new Headers(mocks.external.mock.calls[0][1].headers).get("cookie")).toBeNull();
        expect(new Headers(mocks.external.mock.calls[0][1].headers).get("authorization")).toBeNull();
    });
    it("does not silently turn failed media reads into text-only success", async () => {
        mocks.internal.mockResolvedValue(new Response("denied", { status: 403 }));
        await expect(prepareAgentPlannerMedia([asset], "http://localhost:3001", "", new AbortController().signal)).rejects.toThrow("403");
    });
    it("rejects oversized media before buffering", async () => {
        mocks.internal.mockResolvedValue(new Response(png, { headers: { "content-type": "image/png", "content-length": String(CREATIVE_UPLOAD_MAX_BYTES + 1) } }));
        await expect(prepareAgentPlannerMedia([asset], "http://localhost:3001", "", new AbortController().signal)).rejects.toThrow();
    });
    it("rejects HTML masquerading as an image", async () => {
        mocks.internal.mockResolvedValue(new Response("<html>login</html>", { headers: { "content-type": "text/html" } }));
        await expect(prepareAgentPlannerMedia([asset], "http://localhost:3001", "", new AbortController().signal)).rejects.toThrow();
    });
    it("rejects protocol-relative URLs before sending credentials", async () => {
        await expect(prepareAgentPlannerMedia([{ ...asset, serverUrl: "//evil.test/a" }], "http://localhost:3001", "session=secret", new AbortController().signal)).rejects.toThrow();
        expect(mocks.internal).not.toHaveBeenCalled();
    });
});
