import { describe, expect, it } from "vitest";
import { adaptationParameterValidation, normalizeAdaptationParameters } from "./script-practice-adaptation-parameters";

describe("script practice adaptation parameters", () => {
    it("accepts user-entered duration and shot count when each shot can be generated", () => {
        expect(normalizeAdaptationParameters({ targetDurationSeconds: "180", shotCount: "24", shotStyle: "电影感", viewpoint: "第三人称" })).toEqual({
            targetDurationSeconds: 180,
            shotCount: 24,
            shotStyle: "电影感",
            viewpoint: "第三人称",
        });
    });

    it("rejects a shot count that cannot fit into the requested duration", () => {
        expect(adaptationParameterValidation({ targetDurationSeconds: 180, shotCount: 99 })).toMatchObject({ valid: false, maxShotCount: 45 });
        expect(() => normalizeAdaptationParameters({ targetDurationSeconds: 180, shotCount: 99 })).toThrow("180 秒成片最多可拆 45 镜");
    });

    it("rejects a short-film duration beyond the configured three-minute skill", () => {
        expect(() => normalizeAdaptationParameters({ targetDurationSeconds: 181, shotCount: 24 })).toThrow("成片时长不能超过 180 秒");
    });
});
