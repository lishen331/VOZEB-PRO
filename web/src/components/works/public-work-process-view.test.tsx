import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicWorkProcessView } from "./public-work-process-view";

describe("PublicWorkProcessView", () => {
    it("renders a read-only canvas flow summary without private prompts or task logs", () => {
        const markup = renderToStaticMarkup(
            <PublicWorkProcessView
                process={{
                    sourceType: "canvas",
                    versionId: "version-one",
                    title: "公开画布",
                    nodes: [
                        { id: "node-one", type: "image", title: "构图", summary: "确定画面结构", assetIds: ["asset-one"] },
                        { id: "node-two", type: "video", title: "动态", summary: "生成镜头运动" },
                    ],
                    connections: [{ id: "edge-one", fromNodeId: "node-one", toNodeId: "node-two" }],
                    assets: [{ id: "asset-one", title: "公开参考图", previewUrl: "/media/asset-one" }],
                }}
            />,
        );

        expect(markup).toContain("画布制作流程");
        expect(markup).toContain("构图");
        expect(markup).toContain("确定画面结构");
        expect(markup).toContain("只读");
        expect(markup).toContain("overflow-y-auto");
        expect(markup).not.toContain("内部任务日志");
        expect(markup).not.toContain("privatePrompt");
        expect(markup).not.toContain("button");
    });

    it("summarizes public drama production states", () => {
        const markup = renderToStaticMarkup(
            <PublicWorkProcessView
                process={{
                    sourceType: "drama",
                    versionId: "version-two",
                    title: "公开短剧",
                    characters: [{ id: "character-one", name: "阿青" }],
                    scenes: [{ id: "scene-one", title: "车站" }],
                    episodes: [
                        {
                            id: "episode-one",
                            title: "第一集",
                            order: 1,
                            reviewStatus: "approved",
                            scriptSummary: "在车站重逢",
                            shots: [{ id: "shot-one", order: 1, title: "远景", storyboardAssetIds: ["storyboard-one"], videoAssetIds: ["video-one"], audioAssetIds: ["audio-one"] }],
                        },
                    ],
                    assets: [],
                }}
            />,
        );

        expect(markup).toContain("短剧制作流程");
        expect(markup).toContain("剧本已审核");
        expect(markup).toContain("分镜 1");
        expect(markup).toContain("视频 1");
        expect(markup).toContain("配音 1");
    });
});
