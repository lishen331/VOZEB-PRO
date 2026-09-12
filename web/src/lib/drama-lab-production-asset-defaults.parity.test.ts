import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import defaults from "./drama-lab-production-asset-defaults.json";

const CURRENT_L_CHINESE_DEFAULT_SHA256 = {
    character_extraction: "3a5c9421b6e135bc9afad151b381f320b3d8fddadaa304434ef425482d2ea892",
    scene_extraction: "b908bbfa940e2f31f7faf354678dd20d2c49854f3b5509b6ab09bbf6a51f6797",
    prop_extraction: "fd6e693ae2cd3740c76a883ac03d0b2fba544a6f568b5e1dcdd019cc3277ae77",
} as const;

describe("LocalMiniDrama production asset prompt parity", () => {
    it.each(Object.entries(CURRENT_L_CHINESE_DEFAULT_SHA256))("keeps V %s byte-for-byte equal to the copied L default", (key, expectedHash) => {
        const body = defaults[key as keyof typeof defaults];
        expect(createHash("sha256").update(body, "utf8").digest("hex")).toBe(expectedHash);
    });
});
