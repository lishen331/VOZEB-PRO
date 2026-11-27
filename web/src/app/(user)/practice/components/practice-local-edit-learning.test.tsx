import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LocalEditPromptLesson } from "./practice-local-edit-learning";

it("starts with a single prompt lesson card and preserves the actual prompt and actions", () => {
    const html = renderToStaticMarkup(
        <LocalEditPromptLesson
            record={{ id: "edit-1", createdAt: 0, model: "fixture", prompt: "换成蓝色", sourceUrl: "/source.png", maskUrl: "/mask.png", image: { url: "/result.png", storageKey: "", width: 96, height: 64, bytes: 100, mimeType: "image/png" } }}
            disabled={false} onApply={() => {}} onRestore={() => {}} onCopy={() => {}}
        />,
    );
    expect(html).toContain('aria-label="拆解卡正文"');
    expect(html).toContain("改什么");
    expect(html).not.toContain("改成什么");
    expect(html).not.toContain("什么不变");
    expect(html).toContain("换成蓝色");
    expect(html).toContain("下一张");
    expect(html).toContain("填回修改说明");
    expect(html).toContain("用这次设置继续");
});
