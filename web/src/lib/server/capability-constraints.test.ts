import { describe, expect, it } from "vitest";

import { assertCapabilityConstraints } from "./capability-constraints";

describe("capability constraints", () => {
    it("rejects unsupported reference count, duration, batch and ratio", () => {
        const profile = { maxReferenceImages: 2, maxDurationSeconds: 8, durationSeconds: [5, 8], maxBatchSize: 2, aspectRatios: ["16:9"], resolutions: ["1080P", "2K"] };
        expect(() => assertCapabilityConstraints(profile, { capability: "video", referenceCount: 3 })).toThrow("最多支持 2 张参考图");
        expect(() => assertCapabilityConstraints(profile, { capability: "video", durationSeconds: 9 })).toThrow("最长视频时长");
        expect(() => assertCapabilityConstraints(profile, { capability: "image", batchSize: 3 })).toThrow("批量生成");
        expect(() => assertCapabilityConstraints(profile, { capability: "video", aspectRatio: "9:16" })).toThrow("不支持 9:16 比例");
        expect(() => assertCapabilityConstraints(profile, { capability: "video", durationSeconds: 6 })).toThrow("不支持 6 秒时长");
        expect(() => assertCapabilityConstraints(profile, { capability: "video", resolution: "720p" })).toThrow("不支持 720p 分辨率");
        expect(() => assertCapabilityConstraints(profile, { capability: "image", aspectRatio: "1920x1080", resolution: "2k" })).not.toThrow();
        expect(() => assertCapabilityConstraints(profile, { capability: "image", aspectRatio: "auto", resolution: "AUTO" })).not.toThrow();
    });

    it("rejects reference media when the selected model does not declare support", () => {
        expect(() => assertCapabilityConstraints({ supportsReferenceImage: false }, { capability: "video", referenceTypes: ["image"] })).toThrow("不支持图片参考素材");
        expect(() => assertCapabilityConstraints({ supportsReferenceVideo: false }, { capability: "video", referenceTypes: ["video"] })).toThrow("不支持视频参考素材");
        expect(() => assertCapabilityConstraints({ supportsReferenceAudio: false }, { capability: "video", referenceTypes: ["audio"] })).toThrow("不支持音频参考素材");
        expect(() => assertCapabilityConstraints({ supportsReferenceImage: true }, { capability: "video", referenceTypes: ["image"] })).not.toThrow();
        expect(() => assertCapabilityConstraints({ supportsImageInput: false }, { capability: "text", referenceTypes: ["image"] })).toThrow("不支持图片输入");
    });
});
