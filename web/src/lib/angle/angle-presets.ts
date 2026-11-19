/**
 * 多角度提示词工具。
 * 从 canvas-page-utils.ts 移入，逻辑不变，供画布和多角度练习共用。
 */

export type CanvasAngleshotSize = "closeup" | "near" | "medium" | "wide" | "far";

export type CanvasImageAngleParams = {
    horizontalAngle: number;
    pitchAngle: number;
    shotSize: CanvasAngleshotSize;
    wideAngle: boolean;
    usePrompt: boolean;
};

const SHOT_SIZE_LABELS: Record<CanvasAngleshotSize, string> = {
    closeup: "特写",
    near: "近景",
    medium: "中景",
    wide: "全景",
    far: "远景",
};

export function buildAngleLabel(params: CanvasImageAngleParams): string {
    const horizontal =
        params.horizontalAngle === 0 ? "正面视角" : Math.abs(params.horizontalAngle) === 180 ? "背面视角（向右旋转 180 度）" : params.horizontalAngle > 0 ? `向右旋转 ${params.horizontalAngle} 度` : `向左旋转 ${Math.abs(params.horizontalAngle)} 度`;
    const pitch = params.pitchAngle === 0 ? "水平视角" : params.pitchAngle > 0 ? `俯视 ${params.pitchAngle} 度` : `仰视 ${Math.abs(params.pitchAngle)} 度`;
    const shotSize = params.usePrompt ? SHOT_SIZE_LABELS[params.shotSize] : "";
    return ["AI 多角度", horizontal, pitch, shotSize, params.wideAngle ? "广角" : "标准镜头"].filter(Boolean).join("，");
}

export function buildAnglePrompt(params: CanvasImageAngleParams): string {
    const shotSize = params.usePrompt ? `景别${SHOT_SIZE_LABELS[params.shotSize]}，` : "";
    return `基于参考图重新生成同一主体的新视角，保持主体、颜色、材质和画面风格一致，不要只做透视变形。${buildAngleLabel(params)}。${shotSize ? `${shotSize}镜头不做裁切外的额外变形。` : ""}`;
}
