import { describe, expect, it } from "vitest";

import { normalizeGenerationConcurrency, normalizeGenerationDefaults } from "./store-normalizers";

describe("generation default normalization", () => {
    it("preserves administrator-defined video quality and positive duration", () => {
        expect(normalizeGenerationDefaults({ videoQuality: "1440", videoSeconds: 60 })).toMatchObject({ videoQuality: "1440", videoSeconds: 60 });
        expect(normalizeGenerationDefaults({ videoQuality: "2K", videoSeconds: -1 })).toMatchObject({ videoQuality: "2K", videoSeconds: -1 });
    });

    it("falls back only when the configured video duration is invalid", () => {
        expect(normalizeGenerationDefaults({ videoSeconds: 0 }).videoSeconds).toBe(5);
        expect(normalizeGenerationDefaults({ videoSeconds: 1.5 }).videoSeconds).toBe(5);
    });

    it("preserves administrator-defined positive concurrency without platform ceilings", () => {
        expect(normalizeGenerationConcurrency({ agent: 11, image: 12, video: 6, audio: 13, text: 21, render: 7 })).toEqual({ agent: 11, image: 12, video: 6, audio: 13, text: 21, render: 7 });
    });

    it("preserves bounded Drama Lab compatibility defaults", () => {
        expect(normalizeGenerationDefaults({ dramaMaxBatchSize: 20, dramaImageTimeoutSeconds: 240, dramaVideoTimeoutSeconds: 2400 })).toMatchObject({
            dramaMaxBatchSize: 20,
            dramaImageTimeoutSeconds: 240,
            dramaVideoTimeoutSeconds: 2400,
        });
        expect(normalizeGenerationDefaults({ dramaMaxBatchSize: 0, dramaImageTimeoutSeconds: 9, dramaVideoTimeoutSeconds: 7201 })).not.toMatchObject({
            dramaMaxBatchSize: expect.anything(),
            dramaImageTimeoutSeconds: expect.anything(),
            dramaVideoTimeoutSeconds: expect.anything(),
        });
    });
});
