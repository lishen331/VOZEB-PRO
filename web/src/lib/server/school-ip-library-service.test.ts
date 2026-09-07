import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    listSchoolGrantPackages: vi.fn(),
    requireSchoolManager: vi.fn(),
}));

vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({ listSchoolGrantPackages: mocks.listSchoolGrantPackages }),
}));
vi.mock("./school-access-service", () => ({ requireSchoolManager: mocks.requireSchoolManager }));

import { listSchoolIpAccess } from "./school-ip-library-service";

const now = "2026-09-08T09:00:00.000Z";

describe("school IP library service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue({ school: { id: "school-a" } });
        mocks.listSchoolGrantPackages.mockResolvedValue({
            items: [
                {
                    id: "ip-one",
                    title: "星海计划",
                    slug: "star-sea",
                    summary: "面向影视创作的素材包",
                    visibility: "school",
                    status: "enabled",
                    createdAt: now,
                    updatedAt: now,
                    subIps: [
                        { id: "child-two", ipId: "ip-one", title: "第二子 IP", summary: "", tags: [], sortOrder: 1, createdAt: now, updatedAt: now },
                        { id: "child-one", ipId: "ip-one", title: "第一子 IP", summary: "人物与世界观", tags: [], sortOrder: 0, createdAt: now, updatedAt: now },
                    ],
                    grants: [
                        {
                            id: "old-grant",
                            ipId: "ip-one",
                            subIpId: "child-one",
                            schoolId: "school-a",
                            mode: "multi_school",
                            status: "revoked",
                            startsAt: "2026-08-01T00:00:00.000Z",
                            note: "",
                            revokedAt: "2026-08-31T00:00:00.000Z",
                            createdAt: now,
                            updatedAt: "2026-08-31T00:00:00.000Z",
                        },
                        { id: "current-grant", ipId: "ip-one", subIpId: "child-one", schoolId: "school-a", mode: "exclusive", status: "active", startsAt: "2026-09-01T00:00:00.000Z", note: "", createdAt: now, updatedAt: now },
                        { id: "future-grant", ipId: "ip-one", subIpId: "child-two", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: "2026-10-01T00:00:00.000Z", note: "", createdAt: now, updatedAt: now },
                    ],
                },
            ],
            total: 1,
            page: 2,
            pageSize: 10,
        });
    });

    it("groups all school grants by IP and child without per-grant lookups", async () => {
        const result = await listSchoolIpAccess("manager-a", { page: 2, pageSize: 10 }, new Date(now));

        expect(mocks.listSchoolGrantPackages).toHaveBeenCalledWith({ schoolId: "school-a", page: 2, pageSize: 10 });
        expect(result).toMatchObject({
            total: 1,
            items: [
                {
                    id: "ip-one",
                    effective: true,
                    subIps: [
                        {
                            id: "child-one",
                            effective: true,
                            grants: [
                                { id: "current-grant", effective: true },
                                { id: "old-grant", status: "revoked", revokedAt: "2026-08-31T00:00:00.000Z" },
                            ],
                        },
                        { id: "child-two", effective: false, grants: [{ id: "future-grant", effective: false }] },
                    ],
                },
            ],
        });
    });

    it("keeps historical grants visible while marking a disabled IP unavailable", async () => {
        mocks.listSchoolGrantPackages.mockResolvedValueOnce({
            items: [
                {
                    id: "ip-disabled",
                    title: "已停用 IP",
                    slug: "disabled-ip",
                    summary: "",
                    visibility: "school",
                    status: "disabled",
                    createdAt: now,
                    updatedAt: now,
                    subIps: [{ id: "child-one", ipId: "ip-disabled", title: "第一子 IP", summary: "", tags: [], sortOrder: 0, createdAt: now, updatedAt: now }],
                    grants: [{ id: "grant-one", ipId: "ip-disabled", subIpId: "child-one", schoolId: "school-a", mode: "multi_school", status: "active", startsAt: "2026-09-01T00:00:00.000Z", note: "", createdAt: now, updatedAt: now }],
                },
            ],
            total: 1,
            page: 1,
            pageSize: 12,
        });

        await expect(listSchoolIpAccess("manager-a", {}, new Date(now))).resolves.toMatchObject({ items: [{ id: "ip-disabled", effective: false, subIps: [{ effective: false, grants: [{ status: "active", effective: false }] }] }] });
    });
});
