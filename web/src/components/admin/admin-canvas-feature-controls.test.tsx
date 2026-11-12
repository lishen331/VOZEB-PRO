import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_UI_FEATURES } from "@/lib/canvas-ui-features";
const callbacks = vi.hoisted(() => new Map<string, (enabled: boolean) => void>());
vi.mock("@/components/gamma-ui/gamma-ant", () => ({
    Switch: (props: { "aria-label": string; checked: boolean; disabled: boolean; onChange: (enabled: boolean) => void }) => {
        callbacks.set(props["aria-label"], props.onChange);
        return <button aria-label={props["aria-label"]} aria-checked={props.checked} disabled={props.disabled} />;
    },
}));
import { AdminCanvasFeatureControls } from "./admin-canvas-feature-controls";

describe("Canvas card child switches", () => {
    it("shows exactly the image/video switches and toggles the intended child only", () => {
        const onChange = vi.fn();
        const html = renderToStaticMarkup(<AdminCanvasFeatureControls featureModules={{ canvas: true }} loading={false} onChange={onChange} />);
        expect(html).toContain("图片4K及自定义像素入口");
        expect(html).toContain("视频1080P及自定义清晰度入口");
        expect(html.match(/aria-checked="false"/g)).toHaveLength(2);
        callbacks.get("图片4K及自定义像素入口显示状态")?.(true);
        expect(onChange).toHaveBeenCalledExactlyOnceWith(CANVAS_UI_FEATURES.imageCustomResolution, true);
    });
    it("keeps child selections but disables controls when Canvas is off", () => {
        const html = renderToStaticMarkup(<AdminCanvasFeatureControls featureModules={{ canvas: false, [CANVAS_UI_FEATURES.videoCustomResolution]: true }} loading={false} onChange={vi.fn()} />);
        expect(html.match(/disabled=""/g)).toHaveLength(2);
        expect(html).toContain('aria-checked="true"');
    });
});
