"use client";
import { Image, Select } from "antd";
export type ShotPickerAsset = { id: string; name?: string; location?: string; imageUrl?: string; referenceImageUrl?: string; primaryReferenceId?: string; references?: Array<{ id: string; url: string }> };
export function DramaLabShotAssetPicker({ label, assets, selectedIds, single = false, onChange }: { label: string; assets: ShotPickerAsset[]; selectedIds: string[]; single?: boolean; onChange: (ids: string[]) => void }) {
    const selected = selectedIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is ShotPickerAsset => Boolean(asset));
    return (
        <div className="min-w-0 space-y-2">
            <Select
                aria-label={"选择" + label}
                placeholder={"选择" + label}
                className="w-full"
                mode={single ? undefined : "multiple"}
                allowClear
                showSearch
                optionFilterProp="label"
                maxTagCount="responsive"
                value={single ? selectedIds[0] : selectedIds}
                options={assets.map((asset) => ({ value: asset.id, label: asset.location || asset.name || asset.id }))}
                onChange={(value) => onChange(Array.isArray(value) ? value : value ? [value] : [])}
                notFoundContent={"请先在资产准备中添加" + label}
            />
            {selected.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label={"已绑定" + label}>
                    {selected.map((asset) => {
                        const url = asset.references?.find((ref) => ref.id === asset.primaryReferenceId)?.url || asset.references?.[0]?.url || asset.referenceImageUrl || asset.imageUrl;
                        const name = asset.location || asset.name || asset.id;
                        return (
                            <div key={asset.id} className="flex max-w-full items-center gap-1.5 rounded border border-border p-1" title={name}>
                                {url ? <Image src={url} alt={name} width={36} height={36} style={{ objectFit: "cover" }} /> : <span className="grid size-9 place-items-center bg-muted text-[10px]">缺图</span>}
                                <span className="max-w-24 truncate text-xs">{name}</span>
                            </div>
                        );
                    })}
                </div>
            )}
            {selectedIds.some((id) => !assets.some((asset) => asset.id === id)) && (
                <p role="alert" className="text-xs text-amber-700">
                    绑定资产已失效，请重新选择。
                </p>
            )}
        </div>
    );
}
