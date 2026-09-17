import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");
const routePath = resolve(process.cwd(), "src/app/api/one-click-film/projects/[id]/shots/[shotId]/generate-audio/route.ts");
const runnerPath = resolve(process.cwd(), "src/lib/server/one-click-film/audio-runner.ts");

/**
 * 单镜配音，对应 L `onTtsSbDialogue`（对白配音）与 `onTtsSbNarration`（解说配音）。
 *
 * runner 过滤语义的行为测试在 `src/lib/server/one-click-film/audio-runner.test.ts`；
 * 这里锁「有入口」「按 kind 分别提交」「服务端复用 runner 而非另写一份 TTS」。
 */
describe("one-click-film single-shot dubbing", () => {
    it("exposes L's two dubbing buttons on the shot card", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("生成对白配音`}");
        expect(source).toContain("生成解说配音`}");
        expect(source).toContain('void generateAudio(shot, "dialogue")');
        expect(source).toContain('void generateAudio(shot, "narration")');
    });

    it("only offers a button when the matching text exists, like L", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("shot.dialogue?.trim() ? (");
        expect(source).toContain("shot.narration?.trim() ? (");
    });

    it("sends the audio kind to the one-click route", async () => {
        const source = await readFile(cardsPath, "utf8");
        expect(source).toContain("/generate-audio");
        expect(source).toContain("JSON.stringify({ kind })");
        // 不得回落到教学版链路，否则计费归属会记到 drama-lab
        expect(source).not.toContain("/api/drama-lab");
    });

    it("validates the kind server-side instead of trusting the client", async () => {
        const route = await readFile(routePath, "utf8");
        expect(route).toContain('body.kind === "dialogue" || body.kind === "narration"');
        expect(route).toContain("配音类型必须为 dialogue 或 narration");
    });

    it("refuses to create a task when there is no text", async () => {
        const route = await readFile(routePath, "utf8");
        expect(route).toContain("本镜没有解说旁白文案");
        expect(route).toContain("本镜没有对白文案");
    });

    it("reuses the audio runner rather than duplicating the TTS call", async () => {
        // 终点证据：featureModule 只能有一处来源，复制一份就会漏写
        const route = await readFile(routePath, "utf8");
        expect(route).toContain("runOneClickAudioForEpisodes");
        expect(route).toContain("shotIds: [shotId]");
        expect(route).toContain("kinds: [kind]");
        // 路由自己不得直接拼 audio-tasks 请求
        expect(route).not.toContain("/api/audio-tasks");
        const runner = await readFile(runnerPath, "utf8");
        expect(runner).toContain('featureModule: "one-click-film"');
    });
});
