import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: { id: "admin" } as { id: string } | null, permitted: true, history: vi.fn(), record: vi.fn(), analyze: vi.fn(), settings: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/admin-permissions", () => ({ hasAdminPermission: () => mocks.permitted }));
vi.mock("@/lib/auth/store", () => ({ getFreshAuthSettings: mocks.settings }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: async (request: Request) => request.json() }));
vi.mock("@/lib/server/protocol-analysis-history", () => ({ getProtocolAnalysisHistory: mocks.history, recordProtocolAnalysis: mocks.record, sanitizeProtocolHistory: (value: unknown) => value }));
vi.mock("@/lib/server/channel-protocol-assistant", () => ({
    createChannelProtocolDraft: mocks.analyze,
    ProtocolDraftError: class extends Error {
        constructor(
            message: string,
            public status = 502,
        ) {
            super(message);
        }
    },
}));
import { GET, POST } from "./route";
beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "admin" };
    mocks.permitted = true;
    mocks.settings.mockResolvedValue({ systemChannels: [{ id: "c" }], logicalModels: [{ bindings: [{ channelId: "c", upstreamModel: "video" }] }] });
    mocks.history.mockResolvedValue([]);
    mocks.record.mockResolvedValue({});
    mocks.analyze.mockResolvedValue({ drafts: [{ operations: [] }], warnings: [], sourcePages: 1 });
});
const request = (body: unknown) => new Request("https://local/api/admin/channel-protocol-draft", { method: "POST", body: JSON.stringify(body) });
it("requires an authenticated upstream administrator for history", async () => {
    mocks.user = null;
    expect((await GET(new Request("https://local?channelId=c&targetModel=video"))).status).toBe(401);
    mocks.user = { id: "u" };
    mocks.permitted = false;
    expect((await POST(request({}))).status).toBe(403);
    expect(mocks.history).not.toHaveBeenCalled();
});
it("rejects nonexistent channel-model scopes before analysis", async () => {
    expect((await POST(request({ channelId: "c", targetModel: "wrong" }))).status).toBe(404);
    expect(mocks.analyze).not.toHaveBeenCalled();
});
it("persists scoped successful inputs but never copies arbitrary credentials", async () => {
    const response = await POST(request({ channelId: "c", targetModel: "video", documentationText: "docs", apiKey: "private" }));
    expect(response.status).toBe(200);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ channelId: "c", model: "video", input: expect.objectContaining({ documentationText: "docs" }), result: expect.any(Object) }));
    expect(JSON.stringify(mocks.record.mock.calls)).not.toContain("private");
});
it("retains failure records for scoped analyses", async () => {
    mocks.analyze.mockRejectedValue(new Error("failed"));
    expect((await POST(request({ channelId: "c", targetModel: "video", examples: "updated" }))).status).toBe(502);
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ error: "failed", input: expect.objectContaining({ examples: "updated" }) }));
});
it("keeps ordinary channel analysis unscoped", async () => {
    expect((await POST(request({ documentationText: "docs" }))).status).toBe(200);
    expect(mocks.record).not.toHaveBeenCalled();
});

it("passes only validated reference types and target model to AI and history", async () => {
    expect((await POST(request({ channelId: "c", targetModel: "video", documentationText: "docs", referenceTypes: ["image", "video", "image"] }))).status).toBe(200);
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({ targetModel: "video", referenceTypes: ["image", "video"] }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ referenceTypes: ["image", "video"] }) }));
});
it("rejects invalid input modality context before calling AI", async () => {
    expect((await POST(request({ channelId: "c", targetModel: "video", referenceTypes: ["execute-code"] }))).status).toBe(400);
    expect(mocks.analyze).not.toHaveBeenCalled();
});
