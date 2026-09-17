import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({ mocks: { getAudioTask: vi.fn(), persist: vi.fn(), fetchInternalApi: vi.fn(), getAuthSettings: vi.fn() } }));
vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", () => ({ persistDramaLabShotUpdate: mocks.persist }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));

import { runOneClickAudioForEpisodes } from "./audio-runner";

type Shot = Record<string, unknown>;

function project(shots: Shot[]) {
    return { id: "p1", creativeConversationId: "c1", characters: [], episodes: [{ id: "e1", script: "s", shots }] } as never;
}

const runtime = { origin: "http://internal", cookie: "session=1" };
const input = (shots: Shot[]) => ({ taskId: "task-1", userId: "u1", project: project(shots), episodeIds: ["e1"], runtime });

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthSettings.mockResolvedValue({ defaultModels: { audioModel: "tts-1" } });
    mocks.persist.mockResolvedValue(undefined);
});

describe("one-click-film audio runner", () => {
    it("skips shots without dialogue or narration text instead of failing", async () => {
        const result = await runOneClickAudioForEpisodes(input([{ id: "s1", utterances: [] }]));
        expect(result.status).toBe("success");
        expect(result.childTaskIds).toEqual([]);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("reuses already generated audio without resubmitting TTS", async () => {
        const result = await runOneClickAudioForEpisodes(input([{ id: "s1", dialogue: "hello", dialogueAudio: { status: "success", url: "https://cdn/a.mp3", taskId: "audio-1" } }]));
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(result.status).toBe("success");
        expect(result.childTaskIds).toEqual(["audio-1"]);
        expect(result.outputRefs).toEqual([{ episodeId: "e1", shotId: "s1", kind: "dialogue-audio", url: "https://cdn/a.mp3" }]);
    });

    it("creates a real TTS child task with a deterministic request id and returns pending", async () => {
        mocks.fetchInternalApi.mockResolvedValue({ ok: true, json: async () => ({ task: { id: "audio-new", status: "pending" } }) });
        const result = await runOneClickAudioForEpisodes(input([{ id: "s1", narration: "voice over line" }]));

        expect(result.status).toBe("pending");
        expect(result.childTaskIds).toEqual(["audio-new"]);
        const [url, init] = mocks.fetchInternalApi.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
        expect(url).toBe("http://internal/api/audio-tasks");
        expect(init.headers["X-VOZEB-PRO-Client-Request-Id"]).toBe("task-1:audio:e1:s1:narration:attempt-1");
        const body = JSON.parse(String(init.body)) as { prompt: string; config: { model: string }; context: Record<string, unknown> };
        expect(body.prompt).toBe("voice over line");
        expect(body.config.model).toBe("tts-1");
        expect(body.context).toMatchObject({ featureModule: "one-click-film", episodeId: "e1", shotId: "s1", audioKind: "narration", attemptNo: 1 });
        expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ patch: expect.objectContaining({ narrationAudio: expect.objectContaining({ taskId: "audio-new" }) }) }));
    });

    it("continues polling an in-flight task and surfaces upstream failures", async () => {
        mocks.getAudioTask.mockResolvedValueOnce({ status: "running" });
        const pending = await runOneClickAudioForEpisodes(input([{ id: "s1", dialogue: "hi", dialogueAudio: { status: "running", taskId: "audio-1", attempt: 1 } }]));
        expect(pending.status).toBe("pending");
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();

        mocks.getAudioTask.mockResolvedValueOnce({ status: "error", error: "上游拒绝" });
        await expect(runOneClickAudioForEpisodes(input([{ id: "s1", dialogue: "hi", dialogueAudio: { status: "running", taskId: "audio-1", attempt: 1 } }]))).rejects.toThrow("上游拒绝");
    });
});
