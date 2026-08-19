import { describe, expect, it } from "vitest";

import { IP_IMAGE_CATEGORIES, ipUseTargetPath } from "./ip-library-detail";

describe("IP library detail contract", () => {
    it("keeps the five required image groups", () => {
        expect(IP_IMAGE_CATEGORIES.map((item) => item.label)).toEqual(["角色", "场景", "道具", "特效", "风格参考"]);
    });

    it("hands a stable IP version to each creative workspace", () => {
        const detail = { id: "ip one", version: { id: "version one" } };
        expect(ipUseTargetPath("canvas", detail as never)).toBe("/canvas?ipId=ip+one&versionId=version+one");
        expect(ipUseTargetPath("drama", detail as never)).toBe("/drama?ipId=ip+one&versionId=version+one");
        expect(ipUseTargetPath("practice", detail as never)).toBe("/practice?ipId=ip+one&versionId=version+one");
    });
});
