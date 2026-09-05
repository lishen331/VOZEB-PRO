import { describe, expect, it } from "vitest";

import { normalizeSystemChannel } from "./auth/store-normalizers";
import { canChangeExecutionProfile, isPullFilmSourceType, resolvePracticeModelAccess, type PracticeExecutionProfile } from "./practice-domain";

describe("infinite practice domain", () => {
    it("keeps production and practice channel purposes isolated", () => {
        expect(resolvePracticeModelAccess("production", "production")).toBe(true);
        expect(resolvePracticeModelAccess("production", "open-source-practice")).toBe(false);
        expect(resolvePracticeModelAccess("open-source-practice", "open-source-practice")).toBe(true);
        expect(resolvePracticeModelAccess("open-source-practice", "production")).toBe(false);
        expect(resolvePracticeModelAccess("production", "shared")).toBe(true);
        expect(resolvePracticeModelAccess("open-source-practice", "shared")).toBe(true);
    });

    it("does not allow changing an immutable project execution profile", () => {
        const profile: PracticeExecutionProfile = "production";
        expect(canChangeExecutionProfile(profile, "open-source-practice")).toBe(false);
        expect(canChangeExecutionProfile(profile, profile)).toBe(false);
    });

    it("only allows public canvas and drama sources for pull-film", () => {
        expect(isPullFilmSourceType("canvas")).toBe(true);
        expect(isPullFilmSourceType("drama")).toBe(true);
        expect(isPullFilmSourceType("media")).toBe(false);
        expect(isPullFilmSourceType("work")).toBe(false);
    });

    it("normalizes legacy channels without a purpose as shared", () => {
        expect(normalizeSystemChannel({ id: "legacy", name: "旧渠道", baseUrl: "https://legacy.example.com", apiKey: "key", apiFormat: "openai", models: [], enabled: true }).purpose).toBe("shared");
    });
});
