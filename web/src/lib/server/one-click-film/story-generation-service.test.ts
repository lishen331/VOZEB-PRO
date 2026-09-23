import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: vi.fn() }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: vi.fn() }));
vi.mock("@/lib/server/text-planning-runtime", () => ({ rankTextPlanningCandidates: vi.fn() }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: vi.fn(), resolveInternalOrigin: vi.fn() }));
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge: vi.fn() }));
import { buildOneClickStoryRequest } from "./story-generation-service";
import { buildOneClickStoryPrompts, parseOneClickStory } from "./story-generation-contract";
import type { TextPlanningCandidate } from "@/lib/server/text-planning-runtime";
const input = { storyOutline: "一段故事", storyStyle: "modern", scriptType: "drama", episodeCount: 3 };
describe("L story request and multi-episode parser", () => {
    it("keeps the L array contract, style/type and token budget", () => {
        const prompt = buildOneClickStoryPrompts(input.storyOutline, input.storyStyle, input.scriptType, 3);
        expect(prompt.system).toContain("包含 3 个对象");
        expect(prompt.user).toContain("故事风格：现代");
        expect(prompt.user).toContain("剧本类型：剧情");
        expect(prompt.maxTokens).toBe(6600);
    });
    it.each(["chat", "responses", "gemini"])("sends temperature and token budget without JSON-object mode for %s", (protocol) => {
        const candidate = {
            channelId: "c",
            upstreamModel: "m",
            channel: { apiFormat: protocol === "gemini" ? "gemini" : "openai", advancedConfig: { createPath: protocol === "responses" ? "/responses" : protocol === "gemini" ? "/models/:model:generateContent" : "/chat/completions" } },
        } as TextPlanningCandidate;
        const { body } = buildOneClickStoryRequest(candidate, input);
        expect(JSON.stringify(body)).not.toContain("json_object");
        expect(body).not.toHaveProperty("tools");
        if (protocol === "gemini") expect(body.generationConfig).toEqual({ temperature: 0.8, maxOutputTokens: 6600 });
        else {
            expect(body.temperature).toBe(0.8);
            expect(body[protocol === "responses" ? "max_output_tokens" : "max_tokens"]).toBe(6600);
        }
    });
    it("preserves all episodes rather than extracting only the first JSON object", () => {
        expect(parseOneClickStory('[{"episode":1,"content":"first"},{"episode":2,"script":"second"}]')).toHaveLength(2);
        expect(parseOneClickStory('{"episodes":[{"episode":1,"content":"first"},{"episode":2,"text":"second"}]}')).toHaveLength(2);
        expect(parseOneClickStory("正文")[0].content).toBe("正文");
    });
});
