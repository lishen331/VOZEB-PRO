import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAuthSettings: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));

import { GET } from "./route";

const voiceCustomization = {
    provider: "minimax",
    region: "cn",
    paths: { upload: "/v1/files/upload", clone: "/v1/voice_clone" },
    ttsModels: ["speech-2.8-hd"],
    audioLimits: { formats: ["mp3"], minSec: 10, maxSec: 300, maxMB: 20 },
    designLimits: { promptMax: 500, previewTextMin: 1, previewTextMax: 500 },
    pricing: { clone: 9.9, design: 9.9, currency: "CNY" },
};

const channel = {
    id: "channel-voice",
    name: "音色渠道",
    enabled: true,
    purpose: "shared",
    baseUrl: "https://voice.example",
    apiKey: "secret-key",
    apiFormat: "openai",
    models: ["speech-2.8-hd"],
    advancedConfig: { voiceCustomization },
};

function settings(overrides: Record<string, unknown> = {}) {
    return { systemChannels: [channel], voicePricing: { usdToCny: 7.2, pointsPerYuan: 100 }, ...overrides };
}

function request(ttsModel?: string) {
    const url = new URL("http://localhost/api/custom-voices/capabilities");
    if (ttsModel !== undefined) url.searchParams.set("ttsModel", ttsModel);
    return { nextUrl: url } as never;
}

describe("custom voice capabilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user" });
        mocks.getAuthSettings.mockResolvedValue(settings() as never);
    });

    it("returns the channel config and pricing for a configured model", async () => {
        const response = await GET(request("speech-2.8-hd"));
        const body = await response.json();

        expect(body).toMatchObject({ enabled: true, channelId: "channel-voice", pricing: { usdToCny: 7.2, pointsPerYuan: 100 } });
        expect(body.config).toMatchObject({ provider: "minimax", pricing: { clone: 9.9 } });
        // 上游凭据不能出现在客户端可读的配置里。
        expect(JSON.stringify(body)).not.toContain("secret-key");
    });

    it("disables creation when pricing is not configured", async () => {
        mocks.getAuthSettings.mockResolvedValue(settings({ voicePricing: { usdToCny: 7.2, pointsPerYuan: 0 } }) as never);
        const response = await GET(request("speech-2.8-hd"));
        const body = await response.json();

        expect(body.enabled).toBe(false);
        expect(body.pricing).toBeUndefined();
        expect(body.config).toBeDefined();
    });

    it("reports disabled for models without voice customization", async () => {
        const response = await GET(request("speech-2.6-hd"));
        expect(await response.json()).toEqual({ enabled: false });
    });

    it("requires a model and a signed-in user", async () => {
        expect((await GET(request())).status).toBe(400);
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        expect((await GET(request("speech-2.8-hd"))).status).toBe(401);
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });
});
