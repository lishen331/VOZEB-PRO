import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAuthSettings: vi.fn(), getCurrentUser: vi.fn() }));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));

// 部分 mock：只替换 getCurrentUser，serializeModelCatalogSettings 必须是真实实现，
// 否则下面的不变量守卫等于在测 mock 自己。
vi.mock("@/lib/auth/session", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/auth/session")>()),
    getCurrentUser: mocks.getCurrentUser,
}));

import { DEFAULT_SETTINGS } from "@/lib/auth/store-foundation";
import type { AuthSettings } from "@/lib/auth/store-types";

import { GET } from "./route";

// 刻意不 mock serializeModelCatalogSettings：不变量守卫必须跑真实序列化器，
// mock 掉就失去意义。

function catalogSettings(): AuthSettings {
    const settings: AuthSettings = structuredClone(DEFAULT_SETTINGS);
    settings.systemChannels = [
        {
            id: "channel-one",
            name: "渠道一",
            baseUrl: "https://internal-provider.example/v1",
            apiKey: "synthetic-not-a-real-key",
            apiFormat: "openai",
            models: ["vendor-image"],
            enabled: true,
        },
    ];
    settings.logicalModels = [
        {
            id: "image-main",
            name: "图片模型",
            capability: "image",
            enabled: true,
            bindings: [{ id: "binding-one", channelId: "channel-one", upstreamModel: "vendor-image", enabled: true, priority: 1, weight: 8 }],
        },
    ];
    return settings;
}

function request(headers: Record<string, string> = {}) {
    return new NextRequest("https://app.example/api/model-catalog", { headers });
}

describe("model catalog route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.getAuthSettings.mockResolvedValue(catalogSettings());
    });

    it("rejects an anonymous request without reading the catalog", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(request());

        expect(response.status).toBe(401);
        expect(await response.text()).toBe("");
        // 关键：连配置都不读，目录不可能从这个 URL 泄漏出去。
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("treats a failed session lookup as anonymous", async () => {
        mocks.getCurrentUser.mockRejectedValue(new Error("cookie 解析失败"));

        const response = await GET(request());

        expect(response.status).toBe(401);
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("returns the catalog fields that were removed from the session response", async () => {
        const response = await GET(request());

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.logicalModels).toHaveLength(1);
        expect(body.systemChannels).toHaveLength(1);
        for (const key of ["modelPointCosts", "generationPointMultipliers", "generationConcurrency", "generationDefaults", "defaultModels", "practiceScriptSettings"]) {
            expect(body).toHaveProperty(key);
        }
    });

    it("keeps identity-side fields out of the catalog response", async () => {
        const body = await (await GET(request())).json();

        // 身份侧留在 /api/auth/session：site/featureModules 首屏就要用，等第二个
        // 请求会导致侧栏闪烁与落地跳转抖动。
        expect(body).not.toHaveProperty("site");
        expect(body).not.toHaveProperty("featureModules");
        expect(body).not.toHaveProperty("registrationEnabled");
        expect(body).not.toHaveProperty("user");
    });

    it("never exposes upstream credentials or base urls", async () => {
        const serialized = JSON.stringify(await (await GET(request())).json());

        expect(serialized).not.toContain("synthetic-not-a-real-key");
        expect(serialized).not.toContain("internal-provider.example");
        expect(serialized).toContain("/api/ai/system/channel-one");
    });

    it("sets a weak etag and the cache headers the plan specifies", async () => {
        const response = await GET(request());

        expect(response.headers.get("etag")).toMatch(/^W\/"[0-9a-f]{32}"$/);
        // max-age 30 + swr 300 => 旧配置最长可见约 330 秒，不是 30 秒。
        expect(response.headers.get("cache-control")).toBe("private, max-age=30, stale-while-revalidate=300");
    });

    it("returns the same etag for unchanged configuration", async () => {
        const first = await GET(request());
        const second = await GET(request());

        expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    });

    it("changes the etag when configuration changes", async () => {
        const first = await GET(request());
        const changed = catalogSettings();
        changed.logicalModels[0].name = "改名后的模型";
        mocks.getAuthSettings.mockResolvedValue(changed);

        const second = await GET(request());

        expect(second.headers.get("etag")).not.toBe(first.headers.get("etag"));
    });

    it("short-circuits to an empty 304 when if-none-match matches", async () => {
        const etag = (await GET(request())).headers.get("etag") as string;

        const response = await GET(request({ "if-none-match": etag }));

        expect(response.status).toBe(304);
        expect(await response.text()).toBe("");
        expect(response.headers.get("etag")).toBe(etag);
    });

    it("serves a full body when if-none-match is stale", async () => {
        const response = await GET(request({ "if-none-match": 'W/"0000000000000000000000000000dead"' }));

        expect(response.status).toBe(200);
        expect((await response.json()).logicalModels).toHaveLength(1);
    });

    it("matches an etag inside a multi-value if-none-match list", async () => {
        const etag = (await GET(request())).headers.get("etag") as string;

        const response = await GET(request({ "if-none-match": `W/"0000000000000000000000000000dead", ${etag}` }));

        expect(response.status).toBe(304);
    });

    // 不变量守卫（常驻）：目录必须与身份无关，这是共享缓存的前提。当前代码确实
    // 与账号无关（EntitlementPlanLimits 只有配额计数、planId 在身份侧、
    // SchoolContext 不含模型字段），但 EntitlementPlan.features 是潜在入口——将来
    // 若有人用套餐 feature 控模型可见性，缓存会静默串号，最真实的事故场景是教室
    // 共享机器上换账号命中上一账号副本。见设计文档 2.3。
    it("produces a byte-identical catalog regardless of plan, role or school context", async () => {
        const responses: string[] = [];
        for (const mutate of [
            (settings: AuthSettings) => settings,
            (settings: AuthSettings) => {
                settings.entitlements = { ...settings.entitlements, enabled: true };
                return settings;
            },
            (settings: AuthSettings) => {
                settings.entitlements = { ...settings.entitlements, enabled: false };
                return settings;
            },
        ]) {
            mocks.getAuthSettings.mockResolvedValue(mutate(catalogSettings()));
            responses.push(await (await GET(request())).text());
        }

        expect(new Set(responses).size).toBe(1);
    });
});
