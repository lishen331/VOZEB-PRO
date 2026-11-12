import { once } from "node:events";
import { createServer, type Server } from "node:http";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), registration: vi.fn(), readBytes: vi.fn(), externalRead: vi.fn() }));

// Keep signing, route handling, PNG decoding and concurrency real. No database,
// configured storage or paid upstream is accessed by this local TCP fixture.
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/generation-log-store", () => ({ canAccessGenerationAsset: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => ({}) }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ getDramaLabMembership: vi.fn() }));
vi.mock("@/lib/server/library-asset-store", () => ({ hasLibraryAssetMediaReference: vi.fn() }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.registration, isLocalMediaRegistrationExpired: () => false }));
vi.mock("@/lib/server/security", () => ({ checkLocalMediaRateLimit: vi.fn().mockResolvedValue({ allowed: true }), rateLimitHeaders: vi.fn() }));
vi.mock("@/lib/server/object-storage-service", () => ({ readRegisteredMediaBytes: mocks.readBytes, createExternalMediaReadUrl: mocks.externalRead }));
vi.mock("@/lib/server/reference-asset-store", () => ({ isReferenceAssetPath: (path: string) => path === "permanent/2026/11/05/images/fixture.png", readReferenceAsset: vi.fn() }));

import * as generationRoute from "@/app/api/generation-log-assets/[...path]/route";
import * as referenceRoute from "@/app/api/reference-assets/[...path]/route";
import { buildAgnesVideoRequest } from "./agnes-video-provider";
import { createSignedGenerationAssetUrl, createSignedReferenceAssetUrl } from "./reference-asset-access";

const token = "permanent/2026/11/05/images/fixture.png";
const owner = "fixture-owner";
const routes = [
    { name: "generation-log-assets", handler: generationRoute, sign: createSignedGenerationAssetUrl },
    { name: "reference-assets", handler: referenceRoute, sign: createSignedReferenceAssetUrl },
];

describe.each(routes)("$name provider image download over HTTP", ({ name, handler, sign }) => {
    let server: Server;
    let origin: string;
    let png: Buffer;

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubEnv("VOZEB_PRO_REFERENCE_ASSET_SIGNING_KEY", "local-fixture-signing-key");
        mocks.user.mockResolvedValue(null);
        png = await sharp({ create: { width: 320, height: 480, channels: 3, background: "#745fe8" } })
            .png()
            .toBuffer();
        mocks.registration.mockResolvedValue({ storageKey: token, ownerUserId: owner, mimeType: "image/png", bytes: png.length, storageProvider: "object" });
        mocks.readBytes.mockResolvedValue(png);
        mocks.externalRead.mockResolvedValue("https://storage.invalid/original.png");
        server = createServer(async (incoming, outgoing) => {
            try {
                const url = new URL(incoming.url || "/", origin);
                const request = new Request(url, { method: incoming.method });
                const path = decodeURIComponent(url.pathname.slice(`/api/${name}/`.length)).split("/");
                const response = await handler[incoming.method === "HEAD" ? "HEAD" : "GET"](request, { params: Promise.resolve({ path }) });
                outgoing.writeHead(response.status, Object.fromEntries(response.headers));
                outgoing.end(Buffer.from(await response.arrayBuffer()));
            } catch (error) {
                outgoing.writeHead(500);
                outgoing.end(String(error));
            }
        });
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Missing fixture port");
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterEach(async () => {
        vi.unstubAllEnvs();
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    });

    it("lets a provider fetch the original PNG without cookies or redirects", async () => {
        const url = sign(token, origin, owner);
        const payload = buildAgnesVideoRequest({ model: "agnes-video-2.5", prompt: "图片1 在跳舞", seconds: "5", references: [{ type: "image", url }] });
        expect(payload).toMatchObject({ mode: "reference", images: [url], prompt: "图片1 在跳舞" });
        const response = await fetch(payload.images![0], { redirect: "manual" });
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("content-length")).toBe(String(png.length));
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        const downloaded = Buffer.from(await response.arrayBuffer());
        expect(downloaded).toEqual(png);
        expect(await sharp(downloaded).metadata()).toMatchObject({ format: "png", width: 320, height: 480 });
        expect(mocks.externalRead).not.toHaveBeenCalled();
        expect(mocks.user).not.toHaveBeenCalled();
    });

    it.each(["unsigned", "expired", "tampered", "wrong-owner", "wrong-scope", "wrong-purpose"])("rejects %s anonymous access without reading storage", async (kind) => {
        const otherSigner = name === "generation-log-assets" ? createSignedReferenceAssetUrl : createSignedGenerationAssetUrl;
        const url = new URL(kind === "wrong-scope" ? otherSigner(token, origin, owner) : sign(token, origin, kind === "wrong-owner" ? "another-owner" : owner, kind === "expired" ? Date.now() - 16 * 60_000 : Date.now()));
        url.pathname = `/api/${name}/${token}`;
        if (kind === "unsigned") url.search = "";
        if (kind === "tampered") url.searchParams.set("signature", "tampered");
        if (kind === "wrong-purpose") url.searchParams.set("purpose", "download");
        const response = await fetch(url, { redirect: "manual" });
        expect(response.status).toBe(401);
        expect(response.headers.get("location")).toBeNull();
        await response.arrayBuffer();
        expect(mocks.readBytes).not.toHaveBeenCalled();
        expect(mocks.externalRead).not.toHaveBeenCalled();
    });

    it("keeps authenticated browser display on the existing OSS redirect", async () => {
        mocks.user.mockResolvedValue({ id: owner, role: "user" });
        const response = await fetch(`${origin}/api/${name}/${token}`, { redirect: "manual" });
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://storage.invalid/original.png");
        await response.arrayBuffer();
        expect(mocks.readBytes).not.toHaveBeenCalled();
    });
});
