import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/course-cover-service", () => ({ readSchoolCourseCover: mocks.read }));
import { GET } from "./route";
it("checks session and returns uncached webp via school-scoped service", async () => {
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "manager" });
    const ctx = { params: Promise.resolve({ id: "assignment" }) };
    expect((await GET(new Request("http://localhost"), ctx)).status).toBe(401);
    mocks.read.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const response = await GET(new Request("http://localhost"), ctx);
    expect(mocks.read).toHaveBeenCalledWith("manager", "assignment");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
});
