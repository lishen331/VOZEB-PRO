"use client";
import { Switch } from "@/components/gamma-ui/gamma-ant";
import { CANVAS_UI_FEATURES, isCanvasUiFeatureEnabled, type CanvasUiFeatureId } from "@/lib/canvas-ui-features";
const fields = [
    [CANVAS_UI_FEATURES.imageCustomResolution, "图片节点自定义清晰度"],
    [CANVAS_UI_FEATURES.videoCustomResolution, "视频节点自定义清晰度"],
] as const;
export function AdminCanvasFeatureControls({ featureModules, loading, onChange }: { featureModules: Record<string, boolean>; loading: boolean; onChange: (id: CanvasUiFeatureId, enabled: boolean) => void }) {
    return (
        <div className="mt-3 grid gap-3 border-t border-[var(--gm-border)] pt-3" aria-label="画布节点子功能" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs text-[var(--gm-text-3)]">仅控制自定义参数入口，不影响预设清晰度和已保存参数。</p>
            {fields.map(([id, label]) => (
                <div key={id} className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 text-xs text-[var(--gm-text-2)]">{label}</span>
                    <Switch checked={isCanvasUiFeatureEnabled(featureModules, id)} loading={loading} disabled={featureModules.canvas === false} aria-label={`${label}显示状态`} onChange={(enabled) => onChange(id, enabled)} />
                </div>
            ))}
        </div>
    );
}
