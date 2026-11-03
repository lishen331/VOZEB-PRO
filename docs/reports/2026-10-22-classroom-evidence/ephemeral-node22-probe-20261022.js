const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IMAGE_CONTAINER_KEYS = exports.IMAGE_BASE64_KEYS = exports.IMAGE_URL_KEYS = void 0;
exports.findImageResults = findImageResults;
exports.resolveImageUrlLike = resolveImageUrlLike;
exports.resolveImageBase64Like = resolveImageBase64Like;
exports.isLikelyImageUrl = isLikelyImageUrl;
exports.resolveTaskMediaUrl = resolveTaskMediaUrl;
exports.stringField = stringField;
exports.isRemoteMediaUrl = isRemoteMediaUrl;
exports.dedupeImageResults = dedupeImageResults;
exports.resolveGeneratedMediaUrl = resolveGeneratedMediaUrl;
function findImageResults(value, baseUrl, config, depth = 0) {
    const images = [];
    collectImageResults(value, baseUrl, config, depth, images);
    return dedupeImageResults(images);
}
function collectImageResults(value, baseUrl, config, depth, images) {
    if (!value || depth > 6)
        return null;
    if (typeof value === "string") {
        const inlineImage = rawImageBase64DataUrl(value);
        if (inlineImage) {
            images.push({ dataUrl: inlineImage });
            return;
        }
        const url = resolveImageUrlLike(value, baseUrl, config, false);
        if (url)
            images.push(url);
        const dataUrl = resolveImageBase64Like(value);
        if (!url && dataUrl)
            images.push({ dataUrl });
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            collectImageResults(item, baseUrl, config, depth + 1, images);
        return;
    }
    if (typeof value !== "object")
        return;
    const record = value;
    for (const key of exports.IMAGE_BASE64_KEYS) {
        const dataUrl = resolveImageBase64Like(stringField(record, key));
        if (dataUrl)
            images.push({ dataUrl });
    }
    for (const key of exports.IMAGE_URL_KEYS) {
        const image = resolveImageUrlLike(stringField(record, key), baseUrl, config, true);
        if (image)
            images.push(image);
    }
    for (const key of exports.IMAGE_CONTAINER_KEYS)
        collectImageResults(record[key], baseUrl, config, depth + 1, images);
}
function imageTaskResultFromMedia(images) {
    return { ...images[0], results: images };
}
function resolveImageUrlLike(value, baseUrl, config, fromNamedField) {
    const mediaUrl = value.trim();
    if (!mediaUrl)
        return null;
    if (/^data:image\//i.test(mediaUrl) || /^blob:/i.test(mediaUrl))
        return { dataUrl: mediaUrl };
    if (fromNamedField || isLikelyImageUrl(mediaUrl)) {
        const dataUrl = resolveTaskMediaUrl(config, mediaUrl, baseUrl);
        const remoteUrl = resolveGeneratedMediaUrl(mediaUrl, baseUrl);
        return { dataUrl, remoteUrl: isRemoteMediaUrl(remoteUrl) ? remoteUrl : undefined };
    }
    return null;
}
function resolveImageBase64Like(value) {
    const base64 = value.trim();
    if (!base64)
        return "";
    if (/^data:image\//i.test(base64))
        return base64;
    const rawImage = rawImageBase64DataUrl(base64);
    if (rawImage)
        return rawImage;
    if (base64.length < 64 || !/^[a-z0-9+/=_-]+$/i.test(base64.replace(/\s/g, "")))
        return "";
    return `data:image/png;base64,${base64.replace(/\s/g, "")}`;
}
function rawImageBase64DataUrl(value) {
    const base64 = value.trim().replace(/\s/g, "");
    const mimeType = base64.startsWith("/9j/") ? "image/jpeg" : base64.startsWith("iVBORw0KGgo") ? "image/png" : base64.startsWith("R0lGOD") ? "image/gif" : base64.startsWith("UklGR") ? "image/webp" : "";
    return mimeType && /^[a-z0-9+/=_-]+$/i.test(base64) ? `data:${mimeType};base64,${base64}` : "";
}
function isLikelyImageUrl(value) {
    return /^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("./") || value.startsWith("../") || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(value);
}
function resolveTaskMediaUrl(config, value, baseUrl) {
    if (/^(data|blob):/i.test(value))
        return value;
    const remoteUrl = resolveGeneratedMediaUrl(value, baseUrl);
    if (!config.baseUrl.startsWith("/api/ai/system/"))
        return remoteUrl;
    const proxyBase = config.baseUrl.trim().replace(/\/+$/, "");
    return `${proxyBase}/_media?url=${encodeURIComponent(remoteUrl)}`;
}
function stringField(record, key) {
    const value = record[key];
    return typeof value === "string" ? value.trim() : "";
}
function isRemoteMediaUrl(value) {
    return /^https?:\/\//i.test(value);
}
exports.IMAGE_URL_KEYS = [
    "url",
    "uri",
    "src",
    "image",
    "image_url",
    "imageUrl",
    "media_url",
    "mediaUrl",
    "source_url",
    "sourceUrl",
    "content_url",
    "contentUrl",
    "output_url",
    "outputUrl",
    "download_url",
    "downloadUrl",
    "file_url",
    "fileUrl",
    "asset_url",
    "assetUrl",
    "result_url",
    "resultUrl",
];
exports.IMAGE_BASE64_KEYS = ["b64_json", "b64", "base64", "image_base64", "imageBase64", "base64_json"];
exports.IMAGE_CONTAINER_KEYS = ["data", "result", "results", "response", "payload", "content", "output", "outputs", "images", "image", "asset", "assets", "file", "files", "artifact", "artifacts", "items", "task", "job"];
function dedupeImageResults(items) {
    const seen = new Set();
    return items.filter((item) => {
        const identities = imageResultIdentities(item);
        if (!identities.length || identities.some((identity) => seen.has(identity)))
            return false;
        identities.forEach((identity) => seen.add(identity));
        return true;
    });
}
function imageResultIdentities(item) {
    return Array.from(new Set([item.storageKey, item.serverUrl, item.remoteUrl, item.dataUrl].flatMap(mediaAliases).filter(Boolean)));
}
function mediaAliases(value) {
    const normalized = value?.trim();
    if (!normalized)
        return [];
    if (!normalized.startsWith("/") && !/^https?:\/\//i.test(normalized))
        return [normalized];
    try {
        const parsed = new URL(normalized, "http://vozeb.local");
        const source = parsed.searchParams.get("url")?.trim();
        return source && /^https?:\/\//i.test(source) ? [normalized, source] : [normalized];
    }
    catch {
        return [normalized];
    }
}
const ABSOLUTE_OR_SPECIAL_URL_RE = /^[a-z][a-z\d+.-]*:/i;
function resolveGeneratedMediaUrl(value, baseUrl) {
    const mediaUrl = value.trim();
    if (!mediaUrl)
        return mediaUrl;
    if (ABSOLUTE_OR_SPECIAL_URL_RE.test(mediaUrl))
        return rewriteInternalAbsoluteMediaUrl(mediaUrl, baseUrl);
    const base = parseBaseUrl(baseUrl);
    if (!base)
        return mediaUrl;
    try {
        // Leading-slash result URLs belong to the upstream API host, not the app host.
        if (mediaUrl.startsWith("/"))
            return new URL(mediaUrl, base.origin).toString();
        return new URL(mediaUrl, directoryBaseUrl(base)).toString();
    }
    catch {
        return mediaUrl;
    }
}
function rewriteInternalAbsoluteMediaUrl(mediaUrl, baseUrl) {
    if (!/^https?:\/\//i.test(mediaUrl))
        return mediaUrl;
    const base = parseBaseUrl(baseUrl);
    if (!base || (base.protocol !== "http:" && base.protocol !== "https:"))
        return mediaUrl;
    try {
        const parsed = new URL(mediaUrl);
        if (!isInternalMediaHost(parsed.hostname))
            return mediaUrl;
        parsed.protocol = base.protocol;
        parsed.host = base.host;
        return parsed.toString();
    }
    catch {
        return mediaUrl;
    }
}
function isInternalMediaHost(hostname) {
    const host = hostname.toLowerCase();
    return !host || !host.includes(".") || host.endsWith(".internal") || host.endsWith(".local");
}
function parseBaseUrl(baseUrl) {
    const value = baseUrl?.trim();
    if (!value)
        return null;
    try {
        return new URL(value);
    }
    catch {
        if (typeof window === "undefined")
            return null;
        try {
            return new URL(value, window.location.origin);
        }
        catch {
            return null;
        }
    }
}
function directoryBaseUrl(url) {
    if (url.pathname.endsWith("/"))
        return url.toString();
    const next = new URL(url.toString());
    next.pathname = next.pathname.replace(/\/[^/]*$/, "/");
    next.search = "";
    next.hash = "";
    return next.toString();
}

(async()=>{const rows=[];for(const size of [4500000,9000000]){for(const kind of ['b64_json','data_url']){const b64='iVBORw0KGgo'+'Ab0+/9zZ'.repeat(Math.ceil(size/8)).slice(0,size-11);const fixture=kind==='b64_json'?{data:[{b64_json:b64}]}:{data:[{url:'data:image/png;base64,'+b64}]};const start=performance.now();const row={size,kind};try{const response=new Response(JSON.stringify(fixture),{headers:{'content-type':'application/json'}});const body=await response.json();row.results=exports.findImageResults(body,'https://fixture.invalid/v1/images/generations',{baseUrl:'/api/ai/system/offline',model:'synthetic',apiFormat:'openai'}).length;row.ok=row.results===1;}catch(e){row.ok=false;row.errorName=e.name;row.message=e.message;row.stack=String(e.stack).split('\n').slice(0,8);}row.ms=performance.now()-start;rows.push(row);}}console.log(JSON.stringify({at:new Date().toISOString(),node:process.version,v8:process.versions.v8,readOnlyFixture:true,noRealNetwork:true,noApplicationState:true,commit:'bc2643a5d2c8ddc51173f4a74d45da3c6ee52859',rows}));})();