import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InputHTMLAttributes } from "react";
import { DramaLabAssetDetailFields } from "./drama-lab-asset-detail-fields";
const captured = vi.hoisted(() => ({ inputs: [] as InputHTMLAttributes<HTMLInputElement>[] }));
vi.mock("antd", () => ({
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => {
        captured.inputs.push(props);
        return <input value={props.value} readOnly />;
    },
}));

describe("asset-specific editable fields", () => {
    it.each([
        ["characters", ["role"], ["角色定位"]],
        ["scenes", ["location", "time"], ["场景地点", "场景时间"]],
        ["props", ["type"], ["道具类型"]],
    ] as const)("edits existing %s details without dropping identity/reference metadata", (kind, fields, labels) => {
        captured.inputs = [];
        const asset = { id: "kept", name: "测试", description: "description", role: "原角色", type: "原类型", location: "原地点", time: "原时间", primaryReferenceId: "ref", references: [{ id: "ref", url: "/ref.webp" }], imagePrompt: "keep prompt" };
        const onChange = vi.fn();
        const html = renderToStaticMarkup(<DramaLabAssetDetailFields kind={kind} asset={asset} onChange={onChange} />);
        labels.forEach((label) => expect(html).toContain(label));
        const initialInputs = [...captured.inputs];
        fields.forEach((field, i) => {
            expect(initialInputs[i].value).toBe(asset[field]);
            initialInputs[i].onChange?.({ target: { value: "修改" } } as React.ChangeEvent<HTMLInputElement>);
            expect(onChange).toHaveBeenLastCalledWith({ ...asset, [field]: "修改" });
            captured.inputs = [];
            renderToStaticMarkup(<DramaLabAssetDetailFields kind={kind} asset={{ ...asset, [field]: "修改" }} onChange={onChange} />);
            expect(captured.inputs[i].value).toBe("修改");
        });
    });
});
