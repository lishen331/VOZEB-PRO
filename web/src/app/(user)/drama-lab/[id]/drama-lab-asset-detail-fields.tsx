"use client";
import { Input, Select } from "antd";
import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import type { VisualAssetKind } from "./drama-lab-asset-library-pager";
const roleOptions = [
    { value: "main", label: "主角" },
    { value: "supporting", label: "配角" },
    { value: "minor", label: "次要角色" },
];
const fields = {
    characters: [["role", "角色定位"]],
    scenes: [
        ["location", "场景地点"],
        ["time", "场景时间"],
    ],
    props: [["type", "道具类型"]],
} as const;
export function DramaLabAssetDetailFields<T extends DramaAssetVisualDetails & { location?: string }>({ kind, asset, onChange }: { kind: VisualAssetKind; asset: T; onChange: (asset: T) => void }) {
    return (
        <>
            {fields[kind].map(([key, label]) => (
                <label key={key} className="grid gap-1.5 text-sm">
                    <span>{label}</span>
                    {key === "role" ? (
                        <Select
                            value={asset.role || undefined}
                            placeholder="选择角色定位"
                            options={asset.role && !roleOptions.some((option) => option.value === asset.role) ? [...roleOptions, { value: asset.role, label: `${asset.role}（已有值）` }] : roleOptions}
                            onChange={(role) => onChange({ ...asset, role })}
                        />
                    ) : (
                        <Input value={asset[key] || ""} onChange={(event) => onChange({ ...asset, [key]: event.target.value })} />
                    )}
                </label>
            ))}
        </>
    );
}
