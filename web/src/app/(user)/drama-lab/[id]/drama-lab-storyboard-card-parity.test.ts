import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";
describe("L-equivalent storyboard card", () => {
    it("uses one mode toggle, hover delete, statuses, and no manual sync button", async () => {
        const s = await readFile(path, "utf8");
        expect(s).toContain('shot.creationMode === "universal" ? "经典分镜" : "全能模式"');
        expect(s).toContain("group/storyboard");
        expect(s).toContain("group-hover/storyboard:opacity-100");
        expect(s).not.toContain('title="同步任务状态"');
    });
    it("opens one mode-aware prompt editor and keeps no inline summaries", async () => {
        const s = await readFile(path, "utf8");
        expect(s).toContain("StoryboardPromptDialog");
        expect(s).toContain("原始提示词（分镜拆解时写入，仅供参考）");
        expect(s).toContain("通用优化提示词（经典单图最终使用）");
        expect(s).toContain("全能参考提示词");
        expect(s).not.toContain("function PromptPreview(");
    });
    it("keeps media actions grouped and audio split on the right", async () => {
        const s = await readFile(path, "utf8");
        expect(s).toContain('aria-label="分镜图操作"');
        expect(s).toContain('aria-label="分镜视频操作"');
        expect(s).toContain("按音频拆镜");
        expect(s).toContain("打开配音");
    });
    it("uses L configuration fields", async () => {
        const s = await readFile(path, "utf8");
        for (const field of ["地点", "时间", "时长(秒)", "景别", "运镜", "氛围", "镜头视角", "灯光", "景深", "空间布局锚点", "动作", "对白", "解说旁白", "画面结果", "视频提示词"]) expect(s).toContain(field);
    });
});
