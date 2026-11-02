import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    resolvePracticeModelTestAccess: vi.fn(),
    getAuthSettings: vi.fn(),
    listPracticeCanvasPoolModels: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/user-navigation-permissions", () => ({ resolvePracticeModelTestAccess: mocks.resolvePracticeModelTestAccess }));
vi.mock("@/lib/server/runninghub-workflow-runtime", () => ({
    listPracticeCanvasPoolModels: mocks.listPracticeCanvasPoolModels,
    practiceCanvasVirtualModel: (capability: string) => ({ image: "gamaimage", video: "gamavideo", text: "gamatext" })[capability] || "",
}));

import { GET } from "./route";

describe("/api/practice/available-models", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.resolvePracticeModelTestAccess.mockResolvedValue(false);
        mocks.getAuthSettings.mockResolvedValue({ systemChannels: [] });
        mocks.listPracticeCanvasPoolModels.mockReturnValue([{ id: "agnes-image-2.1-flash", name: "agnes-image-2.1-flash" }]);
    });

    it("requires a login and a valid capability", async () => {
        mocks.currentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/practice/available-models?type=image"))).status).toBe(401);
        mocks.currentUser.mockResolvedValue({ id: "user-one", role: "user" });
        expect((await GET(new Request("http://localhost/api/practice/available-models?type=audio"))).status).toBe(400);
    });

    it("returns the single fixed virtual model to a user without test access", async () => {
        const response = await GET(new Request("http://localhost/api/practice/available-models?type=image"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ mode: "fixed", models: [{ id: "gamaimage", name: "gamaimage" }] });
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
        expect(mocks.resolvePracticeModelTestAccess).toHaveBeenCalledWith({ id: "user-one", role: "user" }, { executionProfile: "open-source-practice", surface: "canvas" });
    });

    it("returns the practice pool models to a user with test access", async () => {
        mocks.resolvePracticeModelTestAccess.mockResolvedValue(true);
        const response = await GET(new Request("http://localhost/api/practice/available-models?type=image"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ mode: "selectable", models: [{ id: "agnes-image-2.1-flash", name: "agnes-image-2.1-flash" }] });
    });
});
