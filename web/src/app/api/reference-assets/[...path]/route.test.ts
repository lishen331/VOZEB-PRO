import { createServer } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    verify: vi.fn(),
    expired: vi.fn(),
    registration: vi.fn(),
    read: vi.fn(),
    isValidPath: vi.fn(),
    stream: vi.fn(),
    disposition: vi.fn(),
    rate: vi.fn(),
    externalRead: vi.fn(),
    readBytes: vi.fn(),
    acquire: vi.fn(),
    wrap: vi.fn(),
    head: vi.fn(),
    release: vi.fn(),
    libraryReference: vi.fn(),
    readableCourseMaterial: vi.fn(),
    fetch: vi.fn(),
    expiry: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/reference-asset-access", () => ({ verifyReferenceAssetSignature: mocks.verify }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.registration, isLocalMediaRegistrationExpired: mocks.expired }));
vi.mock("@/lib/server/reference-asset-store", () => ({ isReferenceAssetPath: mocks.isValidPath, readReferenceAsset: mocks.read }));
vi.mock("@/lib/server/local-media-response", () => ({
    createLocalMediaResponse: mocks.stream,
    createMediaHeadResponse: mocks.head,
    mediaContentDisposition: mocks.disposition,
}));
vi.mock("@/lib/server/media-concurrency", () => ({ acquireMediaConcurrency: mocks.acquire, withMediaConcurrency: mocks.wrap }));
vi.mock("@/lib/server/security", () => ({ checkLocalMediaRateLimit: mocks.rate, rateLimitHeaders: vi.fn(() => ({ "Retry-After": "60" })) }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalMediaReadUrl: mocks.externalRead, readRegisteredMediaBytes: mocks.readBytes }));
vi.mock("@/lib/server/library-asset-store", () => ({ hasLibraryAssetMediaReference: mocks.libraryReference }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ getReadableCourseMaterial: mocks.readableCourseMaterial }) }));

import { GET, HEAD } from "./route";

const nativeFetch = globalThis.fetch;

const context = { params: Promise.resolve({ path: ["permanent", "2026", "07", "20", "images", "file.png"] }) };

describe("reference asset access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", mocks.fetch);
        mocks.verify.mockReturnValue(false);
        mocks.isValidPath.mockReturnValue(true);
        mocks.read.mockResolvedValue({ filePath: "asset.png", size: 5, mimeType: "image/png", registration: { ownerUserId: "owner" } });
        mocks.stream.mockResolvedValue(new Response("image"));
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", mimeType: "image/png" });
        mocks.expired.mockReturnValue(false);
        mocks.disposition.mockReturnValue('inline; filename="file.png"');
        mocks.rate.mockResolvedValue({ allowed: true, remaining: 239, resetAt: Date.now() + 60_000 });
        mocks.externalRead.mockResolvedValue("https://storage.example/signed");
        mocks.acquire.mockReturnValue({ release: mocks.release });
        mocks.wrap.mockImplementation((response: Response) => response);
        mocks.head.mockReturnValue(new Response(null, { status: 200, headers: { "Content-Type": "image/png", "Content-Length": "5" } }));
        mocks.libraryReference.mockResolvedValue(false);
        mocks.readableCourseMaterial.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("serves object images without a cross-origin redirect for canvas reads", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", originalName: "file.png", mimeType: "image/png", storageProvider: "object", bytes: 4 });
        mocks.readBytes.mockResolvedValue(Buffer.from([137, 80, 78, 71]));
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?render=canvas"), context);
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
        expect(mocks.externalRead).not.toHaveBeenCalled();
        expect(mocks.readBytes).toHaveBeenCalledWith(expect.objectContaining({ storageProvider: "object" }), 20 * 1024 * 1024);
    });

    it("does not expose another user's media to an authenticated user", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "other", role: "user" });
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(404);
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it("reads a legacy course attachment when its media registration is missing", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "student", role: "user" });
        mocks.registration.mockResolvedValue(null);
        mocks.readableCourseMaterial.mockResolvedValue({ storageKey: "permanent/2026/07/20/images/file.png", fileName: "课件.png", mimeType: "image/png", bytes: 5, title: "课件" });
        expect((await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context)).status).toBe(200);
        expect(mocks.readableCourseMaterial).toHaveBeenCalledWith("student", "permanent/2026/07/20/images/file.png");
        expect(mocks.read).toHaveBeenCalledWith("permanent/2026/07/20/images/file.png");
    });

    it("allows a visible course member to read platform-owned course media", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "student", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "platform-admin", source: "course-attachment", mimeType: "image/png" });
        mocks.readableCourseMaterial.mockResolvedValue({ storageKey: "permanent/2026/07/20/images/file.png", fileName: "课件.png", mimeType: "image/png", bytes: 5, title: "课件" });
        expect((await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context)).status).toBe(200);
        expect(mocks.readableCourseMaterial).toHaveBeenCalledWith("student", "permanent/2026/07/20/images/file.png");
    });

    it("does not query course authorization for ordinary registered media", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", source: "creative-upload", mimeType: "image/png" });
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(200);
        expect(mocks.readableCourseMaterial).not.toHaveBeenCalled();
    });
    it("allows media referenced by the requesting user's own library asset", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "library-owner", role: "user" });
        mocks.libraryReference.mockResolvedValue(true);

        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);

        expect(response.status).toBe(200);
        expect(mocks.libraryReference).toHaveBeenCalledWith("library-owner", "permanent/2026/07/20/images/file.png");
    });

    it("rejects malformed paths without querying authentication or media registrations", async () => {
        mocks.isValidPath.mockReturnValue(false);
        const response = await GET(new Request("http://localhost/api/reference-assets/not-valid"), { params: Promise.resolve({ path: ["not-valid"] }) });
        expect(response.status).toBe(404);
        expect(mocks.getCurrentUser).not.toHaveBeenCalled();
        expect(mocks.rate).not.toHaveBeenCalled();
        expect(mocks.registration).not.toHaveBeenCalled();
    });

    it("rejects anonymous unsigned access before querying media registrations", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(401);
        expect(mocks.rate).not.toHaveBeenCalled();
        expect(mocks.registration).not.toHaveBeenCalled();
    });

    it("allows the owner and administrators to read registered media", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        const request = new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png", { headers: { "x-vozeb-pro-worker-user-id": "owner" } });
        expect((await GET(request, context)).status).toBe(200);
        expect(mocks.getCurrentUser).toHaveBeenCalledWith(request);
        expect(mocks.disposition).toHaveBeenCalledWith("inline", "file.png", "image/png", "");
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin" });
        expect((await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context)).status).toBe(200);
    });

    it("allows a valid short-lived signature without a login", async () => {
        mocks.verify.mockReturnValue(true);
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?purpose=provider-read&expires=1&signature=test"), context);
        expect(response.status).toBe(200);
        expect(mocks.getCurrentUser).not.toHaveBeenCalled();
        expect(mocks.registration).toHaveBeenCalledWith("permanent/2026/07/20/images/file.png");
        expect(mocks.rate.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.registration.mock.invocationCallOrder[0]);
    });

    it("does not allow an upstream signature to become an anonymous original download", async () => {
        mocks.verify.mockReturnValue(true);
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?purpose=provider-read&expires=1&signature=test&download=original"), context);
        expect(response.status).toBe(403);
        expect(mocks.registration).toHaveBeenCalled();
    });

    it("does not expose an unregistered file through a signed url", async () => {
        mocks.verify.mockReturnValue(true);
        mocks.registration.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?expires=1&signature=test"), context);
        expect(response.status).toBe(404);
        expect(mocks.stream).not.toHaveBeenCalled();
    });

    it("rejects an expired temporary asset before a signed read", async () => {
        mocks.verify.mockReturnValue(true);
        mocks.expired.mockReturnValue(true);
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", storageClass: "temporary", expiresAt: new Date(Date.now() - 1).toISOString() });
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?purpose=provider-read&expires=1&signature=test"), context);
        expect(response.status).toBe(404);
        expect(mocks.rate).not.toHaveBeenCalled();
    });

    it("redirects an authorized object-backed asset to a signed url", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", storageProvider: "object", externalObjectKey: "bucket/file.png" });
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://storage.example/signed");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it("answers object-backed HEAD from registration metadata without creating a GET signature", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", storageProvider: "object", mimeType: "image/png", bytes: 5, originalName: "file.png" });
        const response = await HEAD(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png", { method: "HEAD" }), context);
        expect(response.status).toBe(200);
        expect(mocks.head).toHaveBeenCalled();
        expect(mocks.externalRead).not.toHaveBeenCalled();
        expect(mocks.acquire).not.toHaveBeenCalled();
    });

    it("marks authenticated original HEAD downloads as attachments", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.registration.mockResolvedValue({ ownerUserId: "owner", storageProvider: "object", mimeType: "video/quicktime", bytes: 5, originalName: "generated-video" });
        await HEAD(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png?download=original", { method: "HEAD" }), context);
        expect(mocks.disposition).toHaveBeenCalledWith("attachment", "generated-video", "video/quicktime", "permanent/2026/07/20/images/file.png");
    });

    it("rejects excess concurrent reads before opening local media", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.acquire.mockReturnValue(null);
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(429);
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it("blocks repeated local media access before reading the file", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
        const response = await GET(new Request("http://localhost/api/reference-assets/permanent/2026/07/20/images/file.png"), context);
        expect(response.status).toBe(429);
        expect(mocks.read).not.toHaveBeenCalled();
        expect(mocks.stream).not.toHaveBeenCalled();
    });
});

describe("provider-read object video delivery", () => {
    const videoPath = "permanent/2026/07/20/videos/file.mp4";
    const videoContext = { params: Promise.resolve({ path: videoPath.split("/") }) };
    const signedUrl = `http://localhost/api/reference-assets/${videoPath}?purpose=provider-read&expires=1&signature=test`;
    const video = { ownerUserId: "owner", storageProvider: "object", externalObjectKey: "bucket/file.mp4", mimeType: "video/mp4", bytes: 10, originalName: "file.mp4" };

    beforeEach(async () => {
        vi.clearAllMocks();
        vi.stubGlobal("fetch", mocks.fetch);
        mocks.getCurrentUser.mockResolvedValue(null);
        mocks.verify.mockReturnValue(true);
        mocks.isValidPath.mockReturnValue(true);
        mocks.expired.mockReturnValue(false);
        mocks.registration.mockResolvedValue(video);
        mocks.rate.mockResolvedValue({ allowed: true, remaining: 239, resetAt: Date.now() + 60_000 });
        mocks.externalRead.mockResolvedValue("https://storage.example/signed");
        mocks.fetch.mockResolvedValue(new Response("0123456789", { headers: { "Content-Type": "video/mp4", "Content-Length": "10", "Accept-Ranges": "bytes" } }));
        mocks.acquire.mockReturnValue({ release: mocks.release, setExpiryHandler: mocks.expiry });
        const { withMediaConcurrency } = await vi.importActual<typeof import("@/lib/server/media-concurrency")>("@/lib/server/media-concurrency");
        mocks.wrap.mockImplementation(withMediaConcurrency);
        mocks.head.mockReturnValue(new Response(null, { headers: { "Content-Type": "video/mp4", "Content-Length": "10", "Accept-Ranges": "bytes" } }));
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("serves the signed video at the first hop and only releases its permit when consumed", async () => {
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(200);
        expect(response.headers.get("location")).toBeNull();
        expect(response.headers.get("content-type")).toBe("video/mp4");
        expect(response.headers.get("content-length")).toBe("10");
        expect(response.headers.get("accept-ranges")).toBe("bytes");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
        expect(mocks.release).not.toHaveBeenCalled();
        expect(await response.text()).toBe("0123456789");
        expect(mocks.release).toHaveBeenCalled();
        expect(mocks.getCurrentUser).not.toHaveBeenCalled();
        expect(mocks.readBytes).not.toHaveBeenCalled();
        expect(mocks.read).not.toHaveBeenCalled();
    });

    it.each([
        ["bytes=2-4", "234", "bytes 2-4/10"],
        ["bytes=2-", "23456789", "bytes 2-9/10"],
        ["bytes=-3", "789", "bytes 7-9/10"],
    ])("forwards %s and preserves the OSS 206 metadata", async (range, body, contentRange) => {
        mocks.fetch.mockResolvedValue(
            new Response(body, { status: 206, headers: { "Content-Type": "video/mp4", "Content-Length": String(body.length), "Content-Range": contentRange, "Accept-Ranges": "bytes", ETag: '"video"', "Last-Modified": "Wed, 21 Oct 2026 00:00:00 GMT" } }),
        );
        const request = new Request(signedUrl, { headers: { Range: range, Authorization: "Bearer private", Cookie: "session=private" } });
        const response = await GET(request, videoContext);
        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toBe(contentRange);
        expect(response.headers.get("content-length")).toBe(String(body.length));
        expect(response.headers.get("etag")).toBe('"video"');
        const [target, options] = mocks.fetch.mock.calls[0];
        expect(target).toBe("https://storage.example/signed");
        const forwarded = new Headers(options.headers);
        expect(forwarded.get("range")).toBe(range);
        expect(forwarded.has("authorization")).toBe(false);
        expect(forwarded.has("cookie")).toBe(false);
        expect(await response.text()).toBe(body);
    });

    it("preserves invalid Range 416 without exposing the object store XML error body", async () => {
        const cancel = vi.fn();
        mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 416, headers: { "Content-Type": "application/xml", "Content-Range": "bytes */10", "Accept-Ranges": "bytes" } }));
        const response = await GET(new Request(signedUrl, { headers: { Range: "bytes=20-30" } }), videoContext);
        expect(response.status).toBe(416);
        expect(response.headers.get("content-range")).toBe("bytes */10");
        expect(await response.text()).toBe("");
        expect(cancel).toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalled();
    });

    it("keeps ordinary authenticated video reads on the existing 307 path", async () => {
        mocks.verify.mockReturnValue(false);
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        const response = await GET(new Request(`http://localhost/api/reference-assets/${videoPath}`), videoContext);
        expect(response.status).toBe(307);
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalled();
    });

    it("keeps signed object image reads on the existing 307 path", async () => {
        mocks.registration.mockResolvedValue({ ...video, mimeType: "image/png" });
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(307);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("answers a signed HEAD from registration metadata without fetching or consuming the signature", async () => {
        const response = await HEAD(new Request(signedUrl, { method: "HEAD", headers: { Range: "bytes=2-4" } }), videoContext);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-length")).toBe("10");
        expect(response.body).toBeNull();
        expect(mocks.fetch).not.toHaveBeenCalled();
        expect(mocks.acquire).not.toHaveBeenCalled();
        const first = await GET(new Request(signedUrl), videoContext);
        expect(first.status).toBe(200);
        await first.body?.cancel();
        mocks.fetch.mockResolvedValue(new Response("0123456789"));
        const second = await GET(new Request(signedUrl), videoContext);
        expect(second.status).toBe(200);
        await second.body?.cancel();
    });

    it("uses actual signature validation for invalid, expired, wrong-owner and wrong-purpose video links", async () => {
        vi.stubEnv("VOZEB_PRO_REFERENCE_ASSET_SIGNING_KEY", "provider-read-video-test");
        const access = await vi.importActual<typeof import("@/lib/server/reference-asset-access")>("@/lib/server/reference-asset-access");
        mocks.verify.mockImplementation(access.verifyReferenceAssetSignature);
        const valid = access.createSignedReferenceAssetUrl(videoPath, "http://localhost", "owner");
        const invalid = new URL(valid);
        invalid.searchParams.set("signature", "wrong");
        const purpose = new URL(valid);
        purpose.searchParams.set("purpose", "download");
        const expired = access.createSignedReferenceAssetUrl(videoPath, "http://localhost", "owner", Date.now() - 16 * 60_000);
        const wrongOwner = access.createSignedReferenceAssetUrl(videoPath, "http://localhost", "other");
        for (const url of [invalid.toString(), purpose.toString(), expired, wrongOwner]) {
            expect((await GET(new Request(url), videoContext)).status).toBe(401);
        }
        expect(mocks.fetch).not.toHaveBeenCalled();
        const response = await GET(new Request(valid), videoContext);
        expect(response.status).toBe(200);
        await response.body?.cancel();
    });

    it("does not widen a signed video's access to original downloads", async () => {
        expect((await GET(new Request(`${signedUrl}&download=original`), videoContext)).status).toBe(403);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("rejects expired registrations and exhausted rate/concurrency before contacting OSS", async () => {
        mocks.expired.mockReturnValue(true);
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(404);
        mocks.expired.mockReturnValue(false);
        mocks.rate.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() });
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(429);
        mocks.acquire.mockReturnValueOnce(null);
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(429);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("does not drain the source before the provider reads and propagates cancellation", async () => {
        let pulls = 0;
        const cancel = vi.fn();
        const source = new ReadableStream<Uint8Array>(
            {
                pull(controller) {
                    pulls++;
                    controller.enqueue(new Uint8Array([pulls]));
                },
                cancel,
            },
            { highWaterMark: 0 },
        );
        const upstream = new Response(source);
        const arrayBuffer = vi.spyOn(upstream, "arrayBuffer");
        mocks.fetch.mockResolvedValue(upstream);
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(200);
        await Promise.resolve();
        expect(pulls).toBeLessThanOrEqual(2);
        expect(arrayBuffer).not.toHaveBeenCalled();
        expect(mocks.release).not.toHaveBeenCalled();
        await response.body?.cancel("provider stopped");
        expect(cancel).toHaveBeenCalledWith("provider stopped");
        expect(mocks.release).toHaveBeenCalled();
    });

    it("cancels the source and releases capacity on a request abort", async () => {
        const cancel = vi.fn();
        mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel })));
        const controller = new AbortController();
        const response = await GET(new Request(signedUrl, { signal: controller.signal }), videoContext);
        expect(response.status).toBe(200);
        controller.abort("provider disconnected");
        await Promise.resolve();
        expect(cancel).toHaveBeenCalledWith("provider disconnected");
        expect(mocks.release).toHaveBeenCalled();
    });

    it("cancels an unread object stream when the existing media lease expires", async () => {
        const cancel = vi.fn();
        mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel })));
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(200);
        await mocks.expiry.mock.lastCall![0]();
        expect(cancel).toHaveBeenCalledWith("Media concurrency lease expired");
        expect(mocks.release).toHaveBeenCalled();
    });

    it("rejects a missing successful response body and releases capacity", async () => {
        mocks.fetch.mockResolvedValue(new Response(null));
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(502);
        expect(mocks.release).toHaveBeenCalled();
    });

    it("keeps an invalid signature's authenticated fallback on the ordinary redirect path", async () => {
        mocks.verify.mockReturnValue(false);
        mocks.getCurrentUser.mockResolvedValue({ id: "owner", role: "user" });
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(307);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("releases capacity when the object stream fails after headers", async () => {
        mocks.fetch.mockResolvedValue(
            new Response(
                new ReadableStream({
                    pull(controller) {
                        controller.error(new Error("object stream failed"));
                    },
                }),
            ),
        );
        const response = await GET(new Request(signedUrl), videoContext);
        expect(response.status).toBe(200);
        await expect(response.text()).rejects.toThrow("object stream failed");
        expect(mocks.release).toHaveBeenCalled();
    });

    it.each([403, 404, 500])("returns 502 and cancels an upstream %s response", async (status) => {
        const cancel = vi.fn();
        mocks.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status }));
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(502);
        expect(cancel).toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalled();
    });

    it("releases capacity when the source request fails before headers", async () => {
        mocks.fetch.mockRejectedValue(new Error("OSS unavailable"));
        expect((await GET(new Request(signedUrl), videoContext)).status).toBe(502);
        expect(mocks.release).toHaveBeenCalled();
    });

    it("uses the existing concurrency lease to abort an object fetch still waiting for headers", async () => {
        mocks.fetch.mockImplementation(
            (_url: string, options: RequestInit) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener("abort", () => reject(new Error("expired lease")), { once: true });
                }),
        );
        const pending = GET(new Request(signedUrl), videoContext);
        await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
        expect(mocks.expiry).toHaveBeenCalled();
        mocks.expiry.mock.calls[0][0]();
        expect((await pending).status).toBe(502);
        expect(mocks.release).toHaveBeenCalled();
    });

    it("streams a real local OSS HTTP fixture for full, partial and unsatisfiable reads", async () => {
        const receivedRanges: (string | undefined)[] = [];
        const server = createServer((request, response) => {
            receivedRanges.push(request.headers.range);
            if (request.headers.range === "bytes=20-30") {
                response.writeHead(416, { "Content-Type": "application/xml", "Content-Range": "bytes */10" });
                response.end("<Error>InvalidRange</Error>");
            } else if (request.headers.range === "bytes=2-4") {
                response.writeHead(206, { "Content-Type": "video/mp4", "Content-Length": "3", "Content-Range": "bytes 2-4/10", "Accept-Ranges": "bytes" });
                response.end("234");
            } else {
                response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": "10", "Accept-Ranges": "bytes" });
                response.end("0123456789");
            }
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Fixture did not bind TCP");
        mocks.externalRead.mockResolvedValue(`http://127.0.0.1:${address.port}/signed-video`);
        vi.stubGlobal("fetch", nativeFetch);
        try {
            for (const [range, status, body] of [
                [null, 200, "0123456789"],
                ["bytes=2-4", 206, "234"],
                ["bytes=20-30", 416, ""],
            ] as const) {
                const response = await GET(new Request(signedUrl, { headers: range ? { Range: range } : {} }), videoContext);
                expect(response.status).toBe(status);
                expect(await response.text()).toBe(body);
            }
            expect(receivedRanges).toEqual([undefined, "bytes=2-4", "bytes=20-30"]);
            expect(mocks.release).toHaveBeenCalledTimes(3);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
    });

    it("forwards request cancellation to an object fetch waiting for headers", async () => {
        mocks.fetch.mockImplementation(
            (_url: string, options: RequestInit) =>
                new Promise((_resolve, reject) => {
                    options.signal?.addEventListener("abort", () => reject(new Error("aborted source")), { once: true });
                }),
        );
        const controller = new AbortController();
        const pending = GET(new Request(signedUrl, { signal: controller.signal }), videoContext);
        await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
        controller.abort();
        expect((await pending).status).toBe(502);
        expect(mocks.release).toHaveBeenCalled();
    });
});
