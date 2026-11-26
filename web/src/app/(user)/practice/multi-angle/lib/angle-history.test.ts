import { expect, it } from "vitest";

import type { PracticeSession } from "@/services/api/practice";
import { createAngleShots, groupMultiAngleSessions } from "./angle-history";

const snap = { batchId: "d25305d1-852f-460c-bcd6-099281a1df4a", shotIndex: 0, mode: "camera", h: 30, p: 0, d: 4.8, fisheye: false, preset: "custom", batch: 4, promptOn: false, prompt: "  蓝色机器人  " } as const;

it("builds distinct per-shot prompts with the current submission semantics", () => {
    const shots = createAngleShots(snap);
    expect(shots[1].prompt).toMatchObject({ horizontal: "向右旋转 90°", vertical: "平视 0°", distance: "中景（未写入提示词）", description: "蓝色机器人" });
    expect(shots[1].prompt.full).toContain("蓝色机器人，基于参考图");
    expect(shots[1].prompt.full).not.toContain("中景");
    expect(shots[3].prompt.full).toContain("向左旋转 90 度");
    const [single] = createAngleShots({ ...snap, batch: 1, p: 45, promptOn: true, fisheye: true });
    expect(single.prompt).toMatchObject({ vertical: "俯视 45°", distance: "中景", lens: "广角" });
    expect(single.prompt.full).toContain("景别中景");
});

it("preserves the exact stored per-shot prompt without labeling missing shots as submitted", () => {
    const stored: PracticeSession = {
        id: "one",
        title: "多角度练习",
        module: "storyboard-image",
        mode: "workflow",
        status: "success",
        createdAt: "2026-11-26T00:00:00.000Z",
        updatedAt: "2026-11-26T00:00:00.000Z",
        input: { multiAngle: { ...snap, shotIndex: 1 }, prompt: "这是会话保存的文本", references: [{ type: "asset", inputKey: "referenceImage", id: "permanent/subject.png" }] },
        result: { status: "success", media: { kind: "image", url: "/result" } },
    };
    const [run] = groupMultiAngleSessions([stored]);
    expect(run.shots[1]).toMatchObject({ status: "success", url: "/result", prompt: { full: "这是会话保存的文本", horizontal: "向右旋转 90°" } });
    expect(run.shots[0]).toMatchObject({ status: "missing", prompt: { full: null } });
});
