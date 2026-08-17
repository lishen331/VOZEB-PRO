import { afterEach, describe, expect, it, vi } from "vitest";

import { coursesApi } from "./courses";

describe("courses api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses the platform, school and teaching route families", async () => {
        const fetchMock = vi.fn(async () => Response.json({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }));
        vi.stubGlobal("fetch", fetchMock);

        await coursesApi.listPlatformCourses({ page: 1 });
        await coursesApi.listSchoolCourses({ page: 1 });
        await coursesApi.listTeachingCourses({ page: 1 });
        await coursesApi.listTeachingAssignments({ page: 1 });
        await coursesApi.listOwnSubmissions({ page: 1, assignmentIds: ["task-a", "task-b"] });

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
        expect(calls.map(([url]) => url)).toEqual(["/api/admin/courses?page=1", "/api/school/courses?page=1", "/api/teaching/courses?page=1", "/api/teaching/assignments?page=1", "/api/teaching/submissions?page=1&assignmentId=task-a&assignmentId=task-b"]);
    });

    it("posts stable content references without duplicating preview data", async () => {
        const fetchMock = vi.fn(async () => Response.json({ code: 0, data: { id: "submission-a" }, msg: "ok" }));
        vi.stubGlobal("fetch", fetchMock);
        await coursesApi.submitAssignment("task-a", { note: "完成", references: [{ type: "asset", id: "asset-a" }] });
        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
        const init = calls[0]?.[1] as RequestInit;
        expect(calls[0]?.[0]).toBe("/api/teaching/assignments/task-a/submissions");
        expect(JSON.parse(String(init.body))).toEqual({ note: "完成", references: [{ type: "asset", id: "asset-a" }] });
    });

    it("forwards abort signals for paginated teaching requests", async () => {
        const fetchMock = vi.fn(async () => Response.json({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }));
        vi.stubGlobal("fetch", fetchMock);
        const controller = new AbortController();

        await coursesApi.listSubmissions("task-a", { page: 1 }, { signal: controller.signal });
        await coursesApi.listOwnSubmissions({ page: 1 }, { signal: controller.signal });

        expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/teaching/assignments/task-a/submissions?page=1", expect.objectContaining({ signal: controller.signal }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/teaching/submissions?page=1", expect.objectContaining({ signal: controller.signal }));
    });
});
