import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    readJsonBodyResult: vi.fn(),
    retrySession: vi.fn(),
    fetchInternalApi: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: mocks.readJsonBodyResult }));
vi.mock("@/lib/server/practice-session-service", () => ({ retryPracticeSessionForUser: mocks.retrySession }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi, resolveInternalOrigin: () => "http://internal.test" }));
vi.mock("@/lib/server/generation-execution-policy", () => ({ trustedPracticeTaskHeaders: vi.fn((userId: string, schoolId: string, clientRequestId: string) => ({ "x-practice": `${userId}:${schoolId}:${clientRequestId}` })) }));
vi.mock("@/lib/server/runninghub-workflow-runtime", () => ({ recordWorkflowTaskContext: () => ({ workflowCode: "storyboard_shot_video" }) }));

import { POST } from "./route";

describe("POST /api/practice/sessions/[id] retry", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "student-one", role: "user" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: { action: "retry" } });
        mocks.fetchInternalApi.mockResolvedValue(new Response(JSON.stringify({ task: { id: "task-retry" } }), { status: 200 }));
        mocks.retrySession.mockImplementation(async (_user, _id, deps) => {
            await deps.dispatch({
                sessionId: "session-one",
                userId: "student-one",
                schoolId: "school-one",
                module: "storyboard-video",
                input: { prompt: "推进", audioEnabled: true, lines: [{ text: "台词", audio: "voice-one" }] },
                references: [
                    { type: "asset", id: "permanent/images/shot.png", inputKey: "image" },
                    { type: "asset", id: "permanent/audio/dialogue.wav", inputKey: "audio" },
                ],
                executionProfile: "open-source-practice",
                capability: "video",
                logicalModelId: "practice-video",
                clientRequestId: "request-one",
                projectKind: "canvas",
            });
            return { id: "session-one", status: "running" };
        });
    });

    it("reuses structured workflow input and typed references during retry", async () => {
        const response = await POST(new Request("http://localhost/api/practice/sessions/session-one", { method: "POST", body: JSON.stringify({ action: "retry" }) }), { params: Promise.resolve({ id: "session-one" }) });
        expect(response.status).toBe(200);
        const [, init] = mocks.fetchInternalApi.mock.calls[0];
        expect(JSON.parse(String(init.body))).toMatchObject({
            context: { schoolId: "school-one" },
            audioEnabled: true,
            references: [
                { type: "image", inputKey: "image" },
                { type: "audio", inputKey: "audio" },
            ],
        });
        expect(init.headers.get("x-practice")).toBe("student-one:school-one:request-one");
    });
});
