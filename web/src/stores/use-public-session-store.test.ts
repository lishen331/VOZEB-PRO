import { afterEach, describe, expect, it, vi } from "vitest";

import { applyPublicSiteSettings, loadPublicSession, notifyPublicSettingsChanged, resetPublicSession, usePublicSessionStore } from "@/stores/use-public-session-store";

afterEach(() => {
    resetPublicSession();
    vi.unstubAllGlobals();
});

describe("public session refresh", () => {
    it("applies the administrator save response immediately while preserving the current session", () => {
        usePublicSessionStore.setState({
            ready: true,
            payload: { user: { id: "user-1" } as never, settings: { site: { title: "旧标题", logoUrl: "/old.svg" }, logicalModels: [] } },
        });

        applyPublicSiteSettings({ title: "新标题", logoUrl: "/new.svg" });

        expect(usePublicSessionStore.getState().payload).toMatchObject({
            user: { id: "user-1" },
            settings: { site: { title: "新标题", logoUrl: "/new.svg" }, logicalModels: [] },
        });
    });

    // A1: 目录侧已拆到 GET /api/model-catalog，一次加载是并行两个请求。本测试的原
    // 意图不变：TTL 内不重取、force 重取并换掉目录；只是计数按两个接口算。
    function stubDualFetch(catalogs: Array<Array<{ id: string }>>) {
        const calls: Array<{ url: string; cache?: string }> = [];
        let catalogIndex = 0;
        const fetchMock = vi.fn(async (url: string, init?: { cache?: string }) => {
            calls.push({ url, cache: init?.cache });
            if (url === "/api/auth/session") return Response.json({ user: { id: "user-1" }, settings: { site: { title: "站点" } } });
            const catalog = catalogs[Math.min(catalogIndex++, catalogs.length - 1)];
            return Response.json({ logicalModels: catalog });
        });
        vi.stubGlobal("fetch", fetchMock);
        return { calls, fetchMock };
    }

    it("merges the catalog response into settings so config consumers see one view", async () => {
        stubDualFetch([[{ id: "video-one" }]]);

        const payload = await loadPublicSession();

        // 身份侧与目录侧合成同一个 settings 视图，use-config-store 不感知拆分。
        expect(payload.settings?.site).toMatchObject({ title: "站点" });
        expect(payload.settings?.logicalModels?.map((model) => model.id)).toEqual(["video-one"]);
        expect(usePublicSessionStore.getState().ready).toBe(true);
    });

    it("keeps the session usable when the catalog request fails", async () => {
        const fetchMock = vi.fn(async (url: string) => {
            if (url === "/api/auth/session") return Response.json({ user: { id: "user-1" }, settings: { site: { title: "站点" } } });
            // 未登录时目录接口按设计返回 401，这里等价覆盖。
            return new Response(null, { status: 401 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const payload = await loadPublicSession();

        expect(payload.settings?.site).toMatchObject({ title: "站点" });
        expect(payload.settings).not.toHaveProperty("logicalModels");
        expect(usePublicSessionStore.getState().ready).toBe(true);
    });

    it("can replace a cached model catalog after an administrator saves settings", async () => {
        const { calls, fetchMock } = stubDualFetch([[], [{ id: "video-one" }]]);

        expect((await loadPublicSession()).settings?.logicalModels).toEqual([]);
        expect((await loadPublicSession()).settings?.logicalModels).toEqual([]);
        // TTL 内第二次调用不发请求：一次加载 = session + catalog 两个请求。
        expect(fetchMock).toHaveBeenCalledTimes(2);

        const refreshed = await loadPublicSession({ force: true });

        expect(refreshed.settings?.logicalModels?.map((model) => model.id)).toEqual(["video-one"]);
        expect(usePublicSessionStore.getState().payload).toEqual(refreshed);
        // force 时目录必须绕过 HTTP 缓存，否则 max-age+swr 会让旧配置最长可见约 330 秒。
        expect(calls.filter((call) => call.url === "/api/model-catalog").at(-1)?.cache).toBe("reload");
    });

    it("revalidates the catalog after a settings-change notification", async () => {
        const { calls } = stubDualFetch([[]]);
        // 先排空 revalidate 标志：上一个用例的 afterEach 调了 resetPublicSession，
        // 它按设计会置位该标志（模块级状态跨用例可见），这里不能假设初始为干净。
        await loadPublicSession();
        await loadPublicSession({ force: true });
        expect(calls.filter((call) => call.url === "/api/model-catalog").at(-1)?.cache).toBe("reload");
        const beforeNotify = calls.length;

        notifyPublicSettingsChanged();
        await loadPublicSession();

        // 只清内存 TTL 不够——目录在浏览器 HTTP 缓存里，必须显式绕过一次。
        // 断言增量：通知后确实重新发了请求，且目录这次带 reload。
        expect(calls.length).toBeGreaterThan(beforeNotify);
        expect(calls.filter((call) => call.url === "/api/model-catalog").at(-1)?.cache).toBe("reload");
    });

    it("revalidates the catalog after a session reset so a new account never sees the old copy", async () => {
        const { calls } = stubDualFetch([[]]);
        await loadPublicSession();

        resetPublicSession();
        await loadPublicSession();

        // Cache-Control: private 挡不住同一浏览器换账号，教室共享机器就是这个场景。
        expect(calls.filter((call) => call.url === "/api/model-catalog").at(-1)?.cache).toBe("reload");
    });
});
