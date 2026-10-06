"use client";

import { create } from "zustand";

import { resolveSiteTitle } from "@/lib/site-brand";
import type { LocalUser } from "@/stores/use-user-store";
import type { PublicSystemSettings } from "@/stores/use-config-store";

export type PublicSiteSettings = {
    title: string;
    logoUrl: string;
    iconUrl?: string;
    seoDescription?: string;
    footerCopyright?: string;
    termsUrl?: string;
    termsVersion?: string;
    privacyUrl?: string;
    privacyVersion?: string;
    loginPage?: {
        heroVideoUrl: string;
        heroPosterUrl: string;
        jointBrandUrl: string;
        slogan: string;
        platformName: string;
        footerOrganization: string;
        servicePhone: string;
        serviceHours: string;
    };
    friendLinks?: Array<{ id: string; label: string; url: string; enabled: boolean }>;
    socials?: Record<string, { enabled: boolean; label: string; url: string }>;
};

type PublicSessionPayload = {
    user?: LocalUser | null;
    install?: { firstAdminRequired?: boolean; database?: { healthy?: boolean } };
    settings?: PublicSystemSettings & { site?: PublicSiteSettings };
};

type PublicSessionStore = {
    payload: PublicSessionPayload | null;
    ready: boolean;
};

export const usePublicSessionStore = create<PublicSessionStore>(() => ({ payload: null, ready: false }));

export const PUBLIC_SETTINGS_CHANGED_EVENT = "vozeb-pro-public-settings-changed";
const SESSION_CACHE_TTL_MS = 30_000;
let sessionRequest: Promise<PublicSessionPayload> | null = null;
let sessionLoadedAt = 0;
let sessionRequestVersion = 0;
// 目录侧走浏览器 HTTP 缓存（ETag / 304），所以管理员改配置或换账号后必须显式绕过
// 一次，否则 max-age=30 + stale-while-revalidate=300 会让旧副本最长可见约 330 秒。
// 只清 sessionLoadedAt 不够——那只清本模块的内存 TTL，管不到 HTTP 缓存。
let catalogNeedsRevalidate = false;

// A1: 目录侧配置从 session 拆出后单独取。刻意不用 no-store——那会让 ETag/304 永不
// 命中，拆接口的收益归零。强制刷新时才用 reload 绕过缓存。
// 取不到目录不是致命错误：身份侧足够完成首屏，未登录时本接口按设计返回 401。
async function loadModelCatalog(revalidate: boolean) {
    try {
        const response = await fetch("/api/model-catalog", revalidate ? { cache: "reload" } : undefined);
        if (!response.ok) return null;
        return (await response.json()) as PublicSessionPayload["settings"];
    } catch {
        return null;
    }
}

export function loadPublicSession({ force = false }: { force?: boolean } = {}) {
    const cached = usePublicSessionStore.getState().payload;
    if (!force && sessionRequest) return sessionRequest;
    if (!force && cached && Date.now() - sessionLoadedAt < SESSION_CACHE_TTL_MS) return Promise.resolve(cached);

    const requestVersion = ++sessionRequestVersion;
    const revalidateCatalog = force || catalogNeedsRevalidate;
    catalogNeedsRevalidate = false;
    const request = Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("会话加载失败");
            return (await response.json()) as PublicSessionPayload;
        }),
        loadModelCatalog(revalidateCatalog),
    ])
        .then(([session, catalog]) => {
            if (!catalog) return session;
            // 浅合并成一个 settings 视图，use-config-store 不感知拆分。身份侧放后面：
            // 两侧字段本不重叠，万一将来重叠，以 no-store 拿到的身份侧为准。
            return { ...session, settings: { ...catalog, ...(session.settings || {}) } } as PublicSessionPayload;
        })
        .then((payload) => {
            if (requestVersion === sessionRequestVersion) {
                sessionLoadedAt = Date.now();
                usePublicSessionStore.setState({ payload, ready: true });
            }
            return payload;
        })
        .catch((error) => {
            if (requestVersion === sessionRequestVersion) usePublicSessionStore.setState({ payload: cached, ready: true });
            throw error;
        })
        .finally(() => {
            if (sessionRequest === request) sessionRequest = null;
        });
    sessionRequest = request;
    return request;
}

export function notifyPublicSettingsChanged() {
    sessionLoadedAt = 0;
    // 管理员刚改过配置：下次必须绕过目录的 HTTP 缓存，否则改动要等约 330 秒才可见。
    catalogNeedsRevalidate = true;
    if (typeof window !== "undefined") window.dispatchEvent(new Event(PUBLIC_SETTINGS_CHANGED_EVENT));
}

export function applyPublicSiteSettings(site: PublicSiteSettings) {
    usePublicSessionStore.setState((state) => {
        const payload = state.payload || {};
        return {
            payload: {
                ...payload,
                settings: {
                    ...(payload.settings || {}),
                    site: {
                        ...(payload.settings?.site || {}),
                        ...site,
                        title: resolveSiteTitle(site.title),
                        logoUrl: site.logoUrl?.trim() || "/logo.svg",
                    },
                },
            },
        };
    });
}

export function resetPublicSession() {
    sessionRequestVersion += 1;
    sessionRequest = null;
    sessionLoadedAt = 0;
    // 登出 / 换账号：Cache-Control: private 只挡共享代理，挡不住同一浏览器换账号后
    // 命中上一账号的目录副本（教室共享机器就是这个场景）。必须强制重新校验。
    catalogNeedsRevalidate = true;
    usePublicSessionStore.setState({ payload: null, ready: false });
}
