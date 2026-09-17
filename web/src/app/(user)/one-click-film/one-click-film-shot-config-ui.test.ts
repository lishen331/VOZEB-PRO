import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const editorPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-editor.tsx");
const crudPath = resolve(process.cwd(), "src/lib/server/one-click-film/shot-crud.ts");

/**
 * L「分镜配置」弹窗（FilmCreate.vue 2362 起）：景别 / 俯仰 / 方向 / 运镜 / 灯光 / 景深 / 时长。
 *
 * 取值选项的契约一致性由 `src/lib/one-click/shot-config-options.test.ts` 覆盖；
 * 这里锁「有入口」「会保存」「服务端白名单放行」三件事 —— 少任何一环都是哑参数。
 */
describe("one-click-film shot config tab", () => {
    it("exposes all seven of L's config fields", async () => {
        const source = await readFile(editorPath, "utf8");
        for (const label of ["分镜景别", "分镜俯仰", "分镜方向", "分镜运镜", "分镜灯光风格", "分镜景深", "分镜时长"]) {
            expect(source).toContain(`aria-label="${label}"`);
        }
    });

    it("derives options from the shared contract module", async () => {
        const source = await readFile(editorPath, "utf8");
        expect(source).toContain('from "@/lib/one-click/shot-config-options"');
        for (const name of ["SHOT_ANGLE_S_OPTIONS", "SHOT_ANGLE_V_OPTIONS", "SHOT_ANGLE_H_OPTIONS", "SHOT_MOVEMENT_OPTIONS", "SHOT_LIGHTING_OPTIONS", "SHOT_DEPTH_OF_FIELD_OPTIONS"]) {
            expect(source).toContain(`options={${name}}`);
        }
    });

    it("saves through the same shot update route", async () => {
        const source = await readFile(editorPath, "utf8");
        expect(source).toContain("void saveConfig()");
        expect(source).toContain('aria-label="保存分镜配置"');
        expect(source).toContain("angleS,");
        expect(source).toContain("lightingStyle,");
        expect(source).toContain("depthOfField,");
    });

    it("rejects a non-positive duration instead of sending it", async () => {
        const source = await readFile(editorPath, "utf8");
        expect(source).toContain("时长需为正数，或留空");
        // 留空表示不改这一项，不能默认塞 0
        expect(source).toContain("parsedDuration === undefined ? {} : { duration: parsedDuration }");
    });

    it("is actually persisted: every field is whitelisted server-side", async () => {
        // 终点证据：白名单漏一项就等于界面能选但存不下来
        const crud = await readFile(crudPath, "utf8");
        for (const field of ["angleS", "angleV", "angleH", "cameraMotion", "lightingStyle", "depthOfField", "duration"]) {
            expect(crud).toContain(`"${field}"`);
        }
    });

    it("reaches the video prompt so the choice is observable", async () => {
        // L 把三段视角拼进视频提示词；V 的等价实现在 video-prompt-rebuild
        const rebuild = await readFile(resolve(process.cwd(), "src/lib/server/one-click-film/video-prompt-rebuild.ts"), "utf8");
        expect(rebuild).toContain("oneClickAngleChineseLabel");
        expect(rebuild).toContain("镜头角度：");
    });
});
