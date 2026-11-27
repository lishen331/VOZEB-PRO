import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), access: vi.fn(), detail: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.access }));
vi.mock("@/lib/server/practice-reverse-prompt-history-store", () => ({ getReversePromptHistory: mocks.detail, listReversePromptHistory: mocks.list, readReversePromptHistoryCursor: () => null, reversePromptHistoryEnabled: () => true }));
import { GET } from "./route";
import { GET as getDetail } from "./[id]/route";
const url = "https://practice.invalid/api/practice/reverse-prompt/history";

describe("reverse prompt history endpoints", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.user.mockResolvedValue({ id: "student" });
        mocks.access.mockResolvedValue({ schoolId: "school" });
    });
    it("checks authentication and scope before reading", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await GET(new Request(url))).status).toBe(401);
        mocks.access.mockRejectedValueOnce({ status: 403 });
        expect((await GET(new Request(url))).status).toBe(403);
        expect(mocks.list).not.toHaveBeenCalled();
        mocks.list.mockResolvedValue({ records: [] });
        const response = await GET(new Request(url));
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(mocks.list).toHaveBeenCalledWith({ userId: "student", schoolId: "school" }, null);
    });
    it("returns 404 on inaccessible history id and rejects malformed cursors", async () => {
        expect((await getDetail(new Request(url + "/other"), { params: Promise.resolve({ id: "other" }) })).status).toBe(404);
        expect(mocks.detail).toHaveBeenCalledWith({ userId: "student", schoolId: "school" }, "other");
        expect((await GET(new Request(url + "?cursor=invalid"))).status).toBe(400);
    });
});
