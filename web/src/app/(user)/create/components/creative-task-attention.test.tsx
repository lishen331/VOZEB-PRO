import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreativeTaskAttention } from "./creative-task-attention";
import type { CreativeAgentRun } from "@/services/api/creative";
describe("pending upstream UI", () => {
    it("distinguishes unknown submissions and preserves successful siblings", () => {
        const run: CreativeAgentRun = {
            id: "r",
            conversationId: "c",
            inputMessageId: "i",
            assistantMessageId: "a",
            status: "paused",
            assetIds: [],
            tasks: [
                { id: "one", title: "成功图片", status: "completed" },
                { id: "two", title: "未知图片", status: "needs_review" },
            ],
        };
        const html = renderToStaticMarkup(<CreativeTaskAttention run={run} onControl={async () => {}} />);
        expect(html).toContain("重新检查原任务");
        expect(html).toContain("取消未完成任务");
        expect(html).toContain("成功图片");
        expect(html).toContain("待确认");
        expect(html).not.toContain("<span>重新生成</span>");
    });
});
