import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InputHTMLAttributes } from "react";
import { DramaLabAssetDetailFields } from "./drama-lab-asset-detail-fields";
type RoleSelect = { value?: string; options: { value: string; label: string }[]; onChange: (value: string) => void };
const captured = vi.hoisted(() => ({ inputs: [] as InputHTMLAttributes<HTMLInputElement>[], selects: [] as RoleSelect[] }));
vi.mock("antd", () => ({
    Select: (props: RoleSelect) => {
        captured.selects.push(props);
        return (
            <select value={props.value} onChange={() => {}}>
                {props.options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        );
    },
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => {
        captured.inputs.push(props);
        return <input value={props.value} readOnly />;
    },
}));

describe("asset-specific editable fields", () => {
    it("uses canonical role values with Chinese labels and preserves unknown existing roles", () => {
        captured.selects = [];
        const asset = { id: "keep", name: "角色", role: "legacy-role", references: [{ id: "keep-ref" }] };
        const onChange = vi.fn();
        renderToStaticMarkup(<DramaLabAssetDetailFields kind="characters" asset={asset} onChange={onChange} />);
        expect(captured.selects).toHaveLength(1);
        expect(captured.selects[0].value).toBe("legacy-role");
        expect(captured.selects[0].options).toEqual(
            expect.arrayContaining([
                { value: "main", label: "主角" },
                { value: "supporting", label: "配角" },
                { value: "minor", label: "次要角色" },
                { value: "legacy-role", label: "legacy-role（已有值）" },
            ]),
        );
        captured.selects[0].onChange("supporting");
        expect(onChange).toHaveBeenCalledWith({ ...asset, role: "supporting" });
    });
    it.each([
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
