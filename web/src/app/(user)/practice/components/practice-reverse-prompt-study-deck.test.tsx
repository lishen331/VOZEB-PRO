import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PracticeReversePromptStudyDeck } from "./practice-reverse-prompt-study-deck";

it("keeps technical diagnostics out of the student study deck", () => {
    const legacyProps = { taskId: "fixture-task", model: "fixture-model", diagnostic: { requestId: "fixture-request" } };
    const html = renderToStaticMarkup(
        <PracticeReversePromptStudyDeck
            {...legacyProps}
            analysis={{
                sections: [
                    { id: "subject", observation: "橘猫", phrase: "卡通橘猫" },
                    { id: "style", observation: "平涂", phrase: "矢量插画" },
                ],
                fullPrompt: "卡通橘猫",
            }}
            busy={false}
            blocked={false}
            onCopy={() => {}}
            onAnalyze={() => {}}
        />,
    );
    expect(html).toContain("主体与造型");
    expect(html).toContain("下一张");
    expect(html).toContain("查看完整提示词");
    expect(html).not.toContain("诊断信息");
    expect(html).not.toContain("fixture-task");
    expect(html).not.toContain("fixture-model");
});
