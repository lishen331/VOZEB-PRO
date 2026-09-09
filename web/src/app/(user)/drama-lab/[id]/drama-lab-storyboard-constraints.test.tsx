import { Children, isValidElement, type ReactNode, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DramaLabStoryboardConstraints } from "./drama-lab-storyboard-constraints";

function findControl(node: ReactNode, label: string): ReactElement<Record<string, unknown>> {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<Record<string, unknown>>(child)) continue;
        if (child.props["aria-label"] === label) return child;
        try {
            return findControl(child.props.children as ReactNode, label);
        } catch {
            /* Search the next sibling. */
        }
    }
    throw new Error(`Missing control: ${label}`);
}

const emptyDraft = { shotCount: "", totalDuration: "" };

describe("storyboard constraints", () => {
    it("renders empty targets and +/-/automatic controls without fake default counts or limits", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={emptyDraft} onChange={() => {}} disabled={false} />);
        expect(html).toContain('aria-label="分镜数量"');
        expect(html).toContain('aria-label="视频总时长（秒）"');
        expect(html.match(/value=""/g)).toHaveLength(2);
        for (const label of ["减少分镜数量", "增加分镜数量", "分镜数量由 AI 决定", "减少视频总时长", "增加视频总时长", "视频总时长由 AI 决定"]) expect(html).toContain(`aria-label="${label}"`);
        expect(html).not.toMatch(/\s(?:min|max)="/);
        expect(html.indexOf('aria-label="分镜数量"')).toBeLessThan(html.indexOf('aria-label="视频总时长（秒）"'));
        expect(html.indexOf('aria-label="视频总时长（秒）"')).toBeLessThan(html.indexOf('aria-label="分镜创作与旁白"'));
    });
    it("keeps explicit fractional duration visible and disables every actual control", () => {
        const element = DramaLabStoryboardConstraints({
            value: { shotCount: "12", totalDuration: "90.5" },
            onChange: vi.fn(),
            disabled: true,
            storyboardFrameMode: "first_last",
            onStoryboardFrameModeChange: vi.fn(),
            sequenceMode: "single",
            onSequenceModeChange: vi.fn(),
        });
        const html = renderToStaticMarkup(element);
        expect(html).toContain('value="90.5"');
        const controls = html.match(/<(?:input|button|select)\b[^>]*>/g) || [];
        expect(controls.length).toBeGreaterThan(10);
        for (const control of controls) expect(control).toContain('disabled=""');
    });
    it.each([
        ["增加分镜数量", "", "", "shotCount", "5"],
        ["增加分镜数量", "12", "90.5", "shotCount", "17"],
        ["减少分镜数量", "12", "90.5", "shotCount", "7"],
        ["减少分镜数量", "3", "90.5", "shotCount", ""],
        ["增加视频总时长", "12", "90.5", "totalDuration", "95.5"],
        ["减少视频总时长", "12", "90.5", "totalDuration", "85.5"],
        ["视频总时长由 AI 决定", "12", "90.5", "totalDuration", ""],
        ["分镜数量由 AI 决定", "12", "90.5", "shotCount", ""],
    ])("%s preserves explicit targets and changes only its field", (label, shotCount, totalDuration, field, expected) => {
        const onChange = vi.fn();
        const value = { shotCount, totalDuration, creationMode: "universal" as const, generateNarration: true };
        const tree = DramaLabStoryboardConstraints({ value, onChange, disabled: false });
        (findControl(tree, label).props.onClick as () => void)();
        expect(onChange).toHaveBeenCalledWith({ ...value, [field]: expected });
    });
    it("preserves manually entered fractions and an explicitly cleared input", () => {
        const onChange = vi.fn();
        const tree = DramaLabStoryboardConstraints({ value: emptyDraft, onChange, disabled: false });
        const input = findControl(tree, "视频总时长（秒）");
        (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "0.5" } });
        expect(onChange).toHaveBeenLastCalledWith({ ...emptyDraft, totalDuration: "0.5" });
        (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "" } });
        expect(onChange).toHaveBeenLastCalledWith(emptyDraft);
    });
    it("wires episode-specific input into the actual extraction request", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        expect(source).toContain("normalizeDramaLabStoryboardOptions(constraintDraft)");
        expect(source).toContain("requestId: createDramaLabClientRequestId(), storyboardOptions");
        expect(source).toContain('constraintDrafts[episode?.id || ""]');
    });
});

describe("storyboard mode controls", () => {
    it("renders the selected mode and enabled narration in the second row", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={{ ...emptyDraft, creationMode: "universal", generateNarration: true }} onChange={() => {}} disabled={false} />);
        expect(html).toContain("经典分镜");
        expect(html).toContain("全能分镜");
        expect(html).toContain("生成解说旁白");
        expect(html.match(/checked=""/g)).toHaveLength(2);
    });
    it("does not advertise unwired image modes", () => {
        const html = renderToStaticMarkup(<DramaLabStoryboardConstraints value={emptyDraft} onChange={() => {}} disabled={false} storyboardFrameMode="first_last" sequenceMode="quad_grid" />);
        expect(html).not.toContain("序列图模式");
        expect(html).not.toContain("首尾帧参考图");
        expect(html).not.toContain("readOnly");
    });
    it("sends frame and sequence settings to their own handlers, never extraction onChange", () => {
        const onChange = vi.fn();
        const onStoryboardFrameModeChange = vi.fn();
        const onSequenceModeChange = vi.fn();
        const tree = DramaLabStoryboardConstraints({ value: emptyDraft, onChange, disabled: false, storyboardFrameMode: "single", onStoryboardFrameModeChange, sequenceMode: "single", onSequenceModeChange });
        (findControl(tree, "首尾帧参考图").props.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } });
        (findControl(tree, "序列图模式").props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "quad_grid" } });
        expect(onStoryboardFrameModeChange).toHaveBeenCalledWith("first_last");
        expect(onSequenceModeChange).toHaveBeenCalledWith("quad_grid");
        expect(onChange).not.toHaveBeenCalled();
    });
    it("disables sequence selection with first/last frames without rewriting its controlled value", () => {
        const html = renderToStaticMarkup(
            <DramaLabStoryboardConstraints value={emptyDraft} onChange={() => {}} disabled={false} storyboardFrameMode="first_last" onStoryboardFrameModeChange={() => {}} sequenceMode="nine_grid" onSequenceModeChange={() => {}} />,
        );
        expect(html).toMatch(/<select[^>]*aria-label="序列图模式"[^>]*disabled=""/);
        expect(html).toContain('<option value="nine_grid" selected="">');
    });
});
