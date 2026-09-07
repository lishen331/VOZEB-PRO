export function browserReadableMediaUrl(url: string) {
    const value = (url || "").trim();
    if (!value || !/^https?:\/\//i.test(value)) return value;
    if (typeof window === "undefined") return value;

    try {
        const target = new URL(value);
        if (target.origin === window.location.origin) return value;
        return `/api/media-proxy?url=${encodeURIComponent(value)}`;
    } catch {
        return value;
    }
}

export function isRemoteMediaUrl(url: string) {
    return /^https?:\/\//i.test((url || "").trim());
}

/** Origin-clean bytes for WebGL, pixel reads, cropping and masks. */
export function canvasReadableImageUrl(value: string) {
    const source = value.trim();
    if (!source || /^(?:data:|blob:)/i.test(source)) return source;
    const origin = typeof window === "undefined" ? "http://vozeb.local" : window.location.origin;
    try {
        const url = new URL(source, origin);
        if (url.origin === origin && /^\/api\/(?:reference-assets|generation-log-assets)\//.test(url.pathname)) {
            url.searchParams.set("render", "canvas");
            return `${url.pathname}${url.search}`;
        }
    } catch {
        return source;
    }
    return browserReadableMediaUrl(source);
}
