import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getLocalMediaRegistration: vi.fn(),
    isLocalMediaRegistrationExpired: vi.fn(),
    getReadableCourseMaterial: vi.fn(),
    createPostgresRepositories: vi.fn(),
    validateIpReferences: vi.fn(),
    normalizeIpReferences: vi.fn(),
}));

vi.mock("@/lib/server/local-media-registry", () => ({
    getLocalMediaRegistration: mocks.getLocalMediaRegistration,
    isLocalMediaRegistrationExpired: mocks.isLocalMediaRegistrationExpired,
}));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.createPostgresRepositories,
}));
vi.mock("@/lib/server/ip-library-reference-service", () => ({
    validateIpReferences: mocks.validateIpReferences,
    normalizeIpReferences: mocks.normalizeIpReferences,
}));

import { PracticeReferenceAuthorizationError, expectedMediaType, practiceReferenceMediaUrl, validatePracticeReferences } from "./practice-reference-authorization";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };

function registration(overrides: Record<string, unknown> = {}) {
    return {
        storageKey: "permanent/2026/09/12/images/reference.png",
        scope: "reference",
        storageClass: "permanent",
        type: "image",
        ownerUserId: "user-a",
        mimeType: "image/png",
        bytes: 12,
        source: "test",
        createdAt: "2026-09-12T00:00:00.000Z",
        ...overrides,
    };
}

describe("practice reference authorization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createPostgresRepositories.mockReturnValue({ schoolDomain: { getReadableCourseMaterial: mocks.getReadableCourseMaterial } });
        mocks.getReadableCourseMaterial.mockResolvedValue(null);
        mocks.isLocalMediaRegistrationExpired.mockReturnValue(false);
        mocks.validateIpReferences.mockResolvedValue([]);
        mocks.normalizeIpReferences.mockImplementation((value: unknown) => (Array.isArray(value) ? value : []));
    });

    it("allows the current user's registered reference image and returns canonical metadata", async () => {
        const key = "permanent/2026/09/12/images/reference.png";
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key }));

        const result = await validatePracticeReferences(scope, "storyboard-image", {}, [{ type: "asset", id: key, inputKey: "sceneImage" }]);

        expect(result).toEqual([
            expect.objectContaining({
                type: "asset",
                id: key,
                storageKey: key,
                inputKey: "sceneImage",
                mediaType: "image",
                mimeType: "image/png",
            }),
        ]);
        expect(mocks.getReadableCourseMaterial).not.toHaveBeenCalled();
    });

    it("rejects another user's registered asset when it is not readable course material", async () => {
        const key = "permanent/2026/09/12/images/other.png";
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key, ownerUserId: "user-b" }));

        await expect(validatePracticeReferences(scope, "character", {}, [{ type: "asset", id: key, inputKey: "referenceImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
        expect(mocks.getReadableCourseMaterial).toHaveBeenCalledWith("user-a", key);
    });

    it("allows a readable course material registration without inventing media school scope", async () => {
        const key = "permanent/2026/09/12/images/course.png";
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key, ownerUserId: "course-uploader" }));
        mocks.getReadableCourseMaterial.mockResolvedValue({ storageKey: key, mimeType: "image/png" });

        await expect(validatePracticeReferences(scope, "storyboard-image", {}, [{ type: "asset", id: key, inputKey: "image" }])).resolves.toEqual([expect.objectContaining({ type: "asset", id: key, storageKey: key, mediaType: "image" })]);
    });

    it.each([
        ["missing registration", undefined],
        ["fake permanent key", null],
    ])("rejects a %s instead of trusting the storage-key shape", async (_label, stored) => {
        mocks.getLocalMediaRegistration.mockResolvedValue(stored);

        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: "permanent/2026/09/12/images/not-registered.png", inputKey: "sceneImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
    });

    it("allows the current user's generation-scope registration (library assets saved from practice results) and reports its scope", async () => {
        const key = "permanent/2026/09/12/images/generated.png";
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key, scope: "generation" }));

        await expect(validatePracticeReferences(scope, "storyboard-video", {}, [{ type: "asset", id: key, inputKey: "image" }])).resolves.toEqual([expect.objectContaining({ type: "asset", storageKey: key, scope: "generation", mediaType: "image" })]);
    });

    it("reports reference scope for uploaded assets and rejects expired temporary registrations", async () => {
        mocks.getLocalMediaRegistration.mockResolvedValueOnce(registration());
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: "permanent/2026/09/12/images/reference.png", inputKey: "sceneImage" }])).resolves.toEqual([expect.objectContaining({ scope: "reference" })]);

        mocks.getLocalMediaRegistration.mockResolvedValueOnce(registration({ storageClass: "temporary", expiresAt: "2026-09-11T00:00:00.000Z" }));
        mocks.isLocalMediaRegistrationExpired.mockReturnValueOnce(true);
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: "permanent/2026/09/12/images/reference.png", inputKey: "sceneImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
    });

    it("builds the in-site media route from the registration scope", () => {
        expect(practiceReferenceMediaUrl("permanent/2026/09/12/images/a b.png", "reference")).toBe("/api/reference-assets/permanent/2026/09/12/images/a%20b.png");
        expect(practiceReferenceMediaUrl("permanent/2026/09/12/images/a.png", "generation")).toBe("/api/generation-log-assets/permanent/2026/09/12/images/a.png");
        expect(practiceReferenceMediaUrl("permanent/x.png", undefined)).toBe("/api/reference-assets/permanent/x.png");
        expect(() => practiceReferenceMediaUrl("/etc/passwd")).toThrow(PracticeReferenceAuthorizationError);
    });

    it.each([
        ["video", "video", "sceneImage"],
        ["attachment", "attachment", "image"],
        ["audio in image slot", "audio", "referenceImage"],
        ["image in audio slot", "image", "audio"],
    ])("rejects %s", async (_label, type, inputKey) => {
        const key = `permanent/2026/09/12/${type}/reference`;
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key, type, mimeType: `${type}/octet-stream` }));

        await expect(validatePracticeReferences(scope, "storyboard-video", {}, [{ type: "asset", id: key, inputKey }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
    });

    it("rejects a registration from another school but does not require an absent schoolId", async () => {
        const key = "permanent/2026/09/12/images/school-scoped.png";
        mocks.getLocalMediaRegistration.mockResolvedValueOnce(registration({ storageKey: key, schoolId: "school-b" }));
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: key, inputKey: "sceneImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);

        mocks.getLocalMediaRegistration.mockResolvedValueOnce(registration({ storageKey: key }));
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: key, inputKey: "sceneImage" }])).resolves.toEqual([expect.objectContaining({ storageKey: key })]);
    });

    it("rejects URL-shaped ids instead of treating a client URL as a registered asset", async () => {
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: "/api/reference-assets/permanent/2026/09/12/images/reference.png", inputKey: "sceneImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
        expect(mocks.getLocalMediaRegistration).not.toHaveBeenCalled();
    });

    it("rejects a course material authorization result for a different storage key", async () => {
        const key = "permanent/2026/09/12/images/course.png";
        mocks.getLocalMediaRegistration.mockResolvedValue(registration({ storageKey: key, ownerUserId: "course-uploader" }));
        mocks.getReadableCourseMaterial.mockResolvedValue({ storageKey: "permanent/other-course.png", mimeType: "image/png" });

        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: key, inputKey: "sceneImage" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
    });
    it("rejects an unrecognized input role", async () => {
        await expect(validatePracticeReferences(scope, "scene", {}, [{ type: "asset", id: "permanent/reference.png", inputKey: "unknownRole" }])).rejects.toBeInstanceOf(PracticeReferenceAuthorizationError);
        expect(mocks.getLocalMediaRegistration).not.toHaveBeenCalled();
    });

    it("reuses IP authorization and does not record usage", async () => {
        const ip = { type: "ip", id: "ip-a", subIpId: "sub-a", itemIds: ["item-a"] };
        mocks.normalizeIpReferences.mockReturnValue([ip]);

        await expect(validatePracticeReferences(scope, "storyboard-image", {}, [ip])).resolves.toEqual([ip]);
        expect(mocks.validateIpReferences).toHaveBeenCalledWith("user-a", [ip]);
    });

    it("rejects malformed IP references instead of treating normalization to an empty list as authorized", async () => {
        mocks.normalizeIpReferences.mockReturnValue([]);

        await expect(validatePracticeReferences(scope, "storyboard-image", {}, [{ type: "ip", id: "", subIpId: "", itemIds: [] }])).rejects.toMatchObject({ code: "PRACTICE_REFERENCE_INVALID" });
        expect(mocks.validateIpReferences).not.toHaveBeenCalled();
    });
    it("converts invalid IP authorization into the practice reference domain error", async () => {
        const ip = { type: "ip", id: "ip-a", subIpId: "sub-a", itemIds: [] };
        mocks.normalizeIpReferences.mockReturnValue([ip]);
        mocks.validateIpReferences.mockRejectedValue(new Error("IP 无权访问"));

        const error = await validatePracticeReferences(scope, "storyboard-image", {}, [ip]).catch((value) => value);
        expect(error).toBeInstanceOf(PracticeReferenceAuthorizationError);
        expect(error).toMatchObject({ code: "PRACTICE_REFERENCE_INVALID", status: 400 });
    });

    it("maps controlled input roles to only image or audio", () => {
        expect(expectedMediaType("character", "referenceImage")).toBe("image");
        expect(expectedMediaType("storyboard-video", "audio")).toBe("audio");
        expect(() => expectedMediaType("scene", "attachment")).toThrow(PracticeReferenceAuthorizationError);
    });
});
