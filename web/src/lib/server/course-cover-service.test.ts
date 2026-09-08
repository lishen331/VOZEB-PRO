import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({ write: vi.fn(), registration: vi.fn(), bytes: vi.fn(), manager: vi.fn(), assignment: vi.fn(), course: vi.fn() }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.write }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.registration }));
vi.mock("@/lib/server/object-storage-service", () => ({ readRegisteredMediaBytes: mocks.bytes }));
vi.mock("@/lib/server/school-access-service", async (original) => ({ ...(await original<typeof import("@/lib/server/school-access-service")>()), requireSchoolManager: mocks.manager }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ getSchoolCourseAssignment: mocks.assignment, getPlatformCourse: mocks.course }) }));
import { uploadCourseCover, readSchoolCourseCover } from "./course-cover-service";
describe("course cover", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.manager.mockResolvedValue({ school: { id: "school-a" } });
        mocks.assignment.mockResolvedValue({ courseId: "course-a", status: "active" });
        mocks.course.mockResolvedValue({ status: "published", content: { coverStorageKey: "permanent/cover.webp" } });
    });
    it("validates actual images and persists a permanent cover owned by the admin", async () => {
        const bytes = await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } })
            .png()
            .toBuffer();
        mocks.write.mockResolvedValue({ token: "permanent/cover.webp" });
        expect(await uploadCourseCover("admin", bytes)).toEqual({ storageKey: "permanent/cover.webp", previewUrl: "/api/reference-assets/permanent/cover.webp" });
        expect(mocks.write).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), "image", expect.objectContaining({ ownerUserId: "admin", source: "course-cover" }));
        await expect(uploadCourseCover("admin", Buffer.from("not an image"))).rejects.toMatchObject({ status: 415 });
    });
    it("checks assignment and published course before reading bytes", async () => {
        mocks.assignment.mockResolvedValueOnce(null);
        await expect(readSchoolCourseCover("manager", "assignment-a")).rejects.toMatchObject({ status: 404 });
        expect(mocks.bytes).not.toHaveBeenCalled();
        mocks.registration.mockResolvedValue({ type: "image", storageClass: "permanent" });
        mocks.bytes.mockResolvedValue(
            await sharp({ create: { width: 12, height: 8, channels: 3, background: "red" } })
                .webp()
                .toBuffer(),
        );
        await readSchoolCourseCover("manager", "assignment-a");
        expect(mocks.assignment).toHaveBeenCalledWith("school-a", "assignment-a");
        expect(mocks.registration).toHaveBeenCalledWith("permanent/cover.webp");
    });
});
