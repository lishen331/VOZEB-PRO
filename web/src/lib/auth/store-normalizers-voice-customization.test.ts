import { describe, expect, it } from "vitest";

import { normalizeSystemChannelAdvancedConfig } from "./store-normalizers";

describe("channel advanced config voice customization", () => {
    const voiceCustomization = {
        provider: "qwen",
        region: "cn",
        paths: { customization: "/api/v1/services/audio/tts/customization" },
        ttsModels: ["qwen-audio-3.1-tts-flash"],
        audioLimits: { formats: ["mp3"], minSec: 10, maxSec: 60, maxMB: 10 },
        designLimits: { promptMax: 500, previewTextMin: 15, previewTextMax: 200 },
        pricing: { clone: 0.2, design: 0.2, currency: "CNY" },
    };

    // 渠道配置走字段白名单，漏掉这一项会让库里写好的配置在读取时被静默丢掉。
    it("keeps a configured voice customization block", () => {
        const normalized = normalizeSystemChannelAdvancedConfig({ protocol: "qwen-tts", voiceCustomization } as never);
        expect(normalized?.voiceCustomization).toMatchObject({ provider: "qwen", pricing: { clone: 0.2, design: 0.2, currency: "CNY" }, audioLimits: { minSec: 10, maxSec: 60 } });
    });

    it("drops an invalid or absent block", () => {
        expect(normalizeSystemChannelAdvancedConfig({ protocol: "qwen-tts" } as never)?.voiceCustomization).toBeUndefined();
        expect(normalizeSystemChannelAdvancedConfig({ protocol: "qwen-tts", voiceCustomization: { provider: "unknown" } } as never)?.voiceCustomization).toBeUndefined();
    });
});
