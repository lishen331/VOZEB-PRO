"use client";
import { Input } from "antd";
import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import type { VisualAssetKind } from "./drama-lab-asset-library-pager";
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
                    <Input value={asset[key] || ""} onChange={(event) => onChange({ ...asset, [key]: event.target.value })} />
                </label>
            ))}
        </>
    );
}
