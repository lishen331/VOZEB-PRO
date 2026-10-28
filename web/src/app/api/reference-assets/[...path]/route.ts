import { REFERENCE_ASSET_SIGNATURE_PURPOSE } from "@/lib/reference-asset-url";
import { creativeUploadMaxBytes, creativeUploadTypeFromMime } from "@/lib/creative-upload";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaLabMembership } from "@/lib/server/drama-lab-collaboration-service";
import { hasLibraryAssetMediaReference } from "@/lib/server/library-asset-store";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { acquireMediaConcurrency, withMediaConcurrency } from "@/lib/server/media-concurrency";
import { verifyReferenceAssetSignature } from "@/lib/server/reference-asset-access";
import { createLocalMediaResponse, createMediaHeadResponse, mediaContentDisposition } from "@/lib/server/local-media-response";
import { getLocalMediaRegistration, isLocalMediaRegistrationExpired, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { createExternalMediaReadUrl, readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import { isReferenceAssetPath, readReferenceAsset } from "@/lib/server/reference-asset-store";
import { checkLocalMediaRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

export async function GET(request: Request, context: RouteContext) {
    return serveReferenceAsset(request, context);
}

export async function HEAD(request: Request, context: RouteContext) {
    return serveReferenceAsset(request, context);
}

async function serveReferenceAsset(request: Request, context: RouteContext) {
    const { path } = await context.params;
    const storagePath = path.join("/");
    if (!isReferenceAssetPath(storagePath)) return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
    const url = new URL(request.url);
    const signature = url.searchParams.get("signature") || "";
    let registration: LocalMediaRegistration | null = null;
    if (signature) registration = await getLocalMediaRegistration(storagePath);
    const schoolRepository = createSchoolDomainRepository();
    if (signature && (!registration || isLocalMediaRegistrationExpired(registration))) return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
    const signed = Boolean(registration && !isLocalMediaRegistrationExpired(registration) && verifyReferenceAssetSignature(storagePath, url.searchParams.get("purpose"), url.searchParams.get("expires"), signature, registration.ownerUserId));
    if (signed && url.searchParams.get("download") === "original") return NextResponse.json({ code: 403, data: null, msg: "上游读取签名不提供原件下载" }, { status: 403 });
    let rateIdentity = `signature:${signature}`;
    let currentUser: Awaited<ReturnType<typeof getCurrentUser>> = null;
    if (!signed) {
        currentUser = await getCurrentUser(request);
        if (!currentUser) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
        rateIdentity = `user:${currentUser.id}`;
    }
    const rate = await checkLocalMediaRateLimit(rateIdentity, request);
    if (!rate.allowed) return NextResponse.json({ code: 429, data: null, msg: "媒体访问过于频繁，请稍后重试" }, { status: 429, headers: rateLimitHeaders(rate) });
    registration ||= await getLocalMediaRegistration(storagePath);
    const courseMaterial = currentUser && (!registration || registration.source === "course-attachment") ? await schoolRepository.getReadableCourseMaterial(currentUser.id, storagePath) : null;
    if (!registration && !courseMaterial) return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
    if (registration && isLocalMediaRegistrationExpired(registration)) return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
    if (currentUser && registration && currentUser.role !== "admin" && registration.ownerUserId !== currentUser.id) {
        // Non-owner media remains private unless it is explicitly shared through
        // a project, the user's library, or a visible course assignment.
        const [member, libraryReference] = await Promise.all([registration.projectId ? getDramaLabMembership(currentUser.id, registration.projectId) : Promise.resolve(null), hasLibraryAssetMediaReference(currentUser.id, storagePath)]);
        if (!member && !libraryReference && !courseMaterial) return NextResponse.json({ code: 404, data: null, msg: "媒体文件不存在" }, { status: 404 });
    }
    const mediaRegistration = registration;
    const mediaMimeType = mediaRegistration?.mimeType || courseMaterial?.mimeType || "application/octet-stream";
    const mediaName = mediaRegistration?.originalName || courseMaterial?.fileName || path.at(-1) || "media";
    if (request.method === "HEAD" && mediaRegistration?.storageProvider === "object") {
        return createMediaHeadResponse(mediaRegistration.mimeType, mediaRegistration.bytes, {
            "Cache-Control": storagePath.startsWith("permanent/") ? "private, max-age=86400" : "private, max-age=300",
            "Content-Disposition": mediaContentDisposition(
                url.searchParams.get("download") === "original" ? "attachment" : "inline",
                mediaName,
                mediaMimeType,
                url.searchParams.get("download") === "original" ? mediaRegistration?.storageKey || storagePath : "",
            ),
        });
    }

    const permit = acquireMediaConcurrency("local", rateIdentity);
    if (!permit) return NextResponse.json({ code: 429, data: null, msg: "媒体并发访问过多，请稍后重试" }, { status: 429, headers: { "Retry-After": "2" } });
    if (mediaRegistration?.storageProvider === "object") {
        try {
            // WebGL/canvas pixel reads require an origin-clean response. Normal
            // display still redirects to OSS; only explicit canvas reads use bytes.
            if (url.searchParams.get("render") === "canvas" && mediaRegistration.mimeType.startsWith("image/")) {
                const bytes = await readRegisteredMediaBytes(mediaRegistration, creativeUploadMaxBytes(creativeUploadTypeFromMime(mediaRegistration.mimeType) || "image"));
                const response = new Response(new Uint8Array(bytes), { headers: { "Content-Type": mediaRegistration.mimeType, "Content-Length": String(bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
                return withMediaConcurrency(response, permit, request.signal);
            }
            const externalUrl = await createExternalMediaReadUrl(request, mediaRegistration);
            if (externalUrl && signed && url.searchParams.get("purpose") === REFERENCE_ASSET_SIGNATURE_PURPOSE && mediaRegistration.mimeType.startsWith("video/")) {
                const sourceAbort = new AbortController();
                permit.setExpiryHandler(() => sourceAbort.abort("Media concurrency lease expired"));
                const range = request.headers.get("range");
                const source = await fetch(externalUrl, { headers: { "Accept-Encoding": "identity", ...(range ? { Range: range } : {}) }, signal: AbortSignal.any([request.signal, sourceAbort.signal]), cache: "no-store" });
                if ((source.status !== 200 && source.status !== 206 && source.status !== 416) || (source.status !== 416 && !source.body)) {
                    await source.body?.cancel().catch(() => undefined);
                    throw new Error(`Object video read failed (${source.status})`);
                }
                const headers = new Headers({
                    "Content-Type": mediaRegistration.mimeType,
                    "Content-Disposition": mediaContentDisposition("inline", mediaName, mediaMimeType),
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "private, no-store",
                    "Cross-Origin-Resource-Policy": "same-site",
                    "X-Content-Type-Options": "nosniff",
                    "X-Robots-Tag": "noindex, nofollow, noarchive",
                });
                for (const name of ["Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
                    const value = source.headers.get(name);
                    if (value !== null) headers.set(name, value);
                }
                if (source.status === 416) {
                    await source.body?.cancel().catch(() => undefined);
                    headers.delete("Content-Length");
                }
                return withMediaConcurrency(new Response(source.status === 416 ? null : source.body, { status: source.status, headers }), permit, request.signal);
            }
            permit.release();
            return externalUrl ? externalMediaRedirect(externalUrl) : NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
        } catch (error) {
            permit.release();
            console.error("Reference object storage read failed", error);
            return NextResponse.json({ error: "外部存储文件读取失败" }, { status: 502 });
        }
    }
    try {
        const asset = await readReferenceAsset(storagePath);
        if (!asset) {
            permit.release();
            return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
        }
        const response = await createLocalMediaResponse(request, asset.filePath, asset.mimeType, {
            "Cache-Control": storagePath.startsWith("permanent/") ? "private, max-age=86400" : "private, max-age=300",
            "Content-Disposition": mediaContentDisposition(
                url.searchParams.get("download") === "original" ? "attachment" : "inline",
                mediaName,
                asset.mimeType || mediaMimeType,
                url.searchParams.get("download") === "original" ? mediaRegistration?.storageKey || storagePath : "",
            ),
        });
        if (!response) {
            permit.release();
            return NextResponse.json({ error: "媒体文件不存在或已过期" }, { status: 404 });
        }
        return withMediaConcurrency(response, permit, request.signal);
    } catch (error) {
        permit.release();
        throw error;
    }
}

function externalMediaRedirect(url: string) {
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Cross-Origin-Resource-Policy", "same-site");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
}
