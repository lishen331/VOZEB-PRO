import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DramaLabTaskPanel } from "./drama-lab-task-panel";

const base = {
    id: "task-one",
    projectId: "project-one",
    taskType: "video" as const,
    status: "running" as const,
    episodeId: "episode-one",
    shotId: "shot-one",
    progress: null,
    canCancel: true,
    canRetry: false,
    title: "分镜视频生成",
    createdAt: 1,
    updatedAt: 2,
};

describe("DramaLabTaskPanel", () => {
    it("shows active count, coordinates, indeterminate progress, and cancel", () => {
        const markup = renderToStaticMarkup(<DramaLabTaskPanel projectId="project-one" episodes={[{ id: "episode-one", number: 1, title: "开端" }]} initialTasks={[base]} />);
        expect(markup).toContain("任务状态");
        expect(markup).toContain("第1集 开端");
        expect(markup).toContain("分镜 shot-one");
        expect(markup).toContain('data-progress-indeterminate="true"');
        expect(markup).toContain("取消分镜视频生成");
    });

    it("does not render terminal errors", () => {
        const markup = renderToStaticMarkup(<DramaLabTaskPanel projectId="project-one" initialTasks={[{ ...base, status: "error", canCancel: false, canRetry: true, progress: 35, error: "上游任务失败" }]} />);
        expect(markup).toContain("失败");
        expect(markup).toContain("上游任务失败");
        expect(markup).toContain("可重试");
    });

    it("does not keep completed or cancelled tasks in the panel", () => {
        const markup = renderToStaticMarkup(
            <DramaLabTaskPanel
                projectId="project-one"
                initialTasks={[
                    { ...base, id: "done", status: "success", canCancel: false, title: "已完成任务" },
                    { ...base, id: "cancelled", status: "cancelled", canCancel: false, title: "已取消任务" },
                ]}
            />,
        );
        expect(markup).not.toContain("已完成任务");
        expect(markup).not.toContain("已取消任务");
    });

    it("keeps a collapsed badge available", () => {
        const markup = renderToStaticMarkup(<DramaLabTaskPanel projectId="project-one" initialTasks={[base]} />);
        expect(markup).toContain('aria-expanded="true"');
        expect(markup).toContain("刷新任务状态");
    });
});
