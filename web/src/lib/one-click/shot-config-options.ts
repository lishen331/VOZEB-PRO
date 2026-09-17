import angleContract from "@/lib/server/one-click-film/angle-l-contract.json";
import photographyContract from "@/lib/server/one-click-film/photography-inference-l-contract.json";

export type ShotConfigOption = { value: string; label: string };

/**
 * 分镜配置各字段的取值。
 *
 * **键一律从既有契约派生，不在这里另写一份**：
 * - 方向 / 俯仰 / 景别 直接取 `angle-l-contract.json` 的 `chineseLabel`
 *   （该契约是逐条比对 L angleService 得到的，96 组组合都校验过）；
 * - 运镜取 `photography-inference-l-contract.json` 的 `movementEnums`；
 * - 灯光取同一契约 `lightingRules` 的 value 去重；
 * - 景深取 `photography-inference.ts` 实际会写入的三个值。
 *
 * 这样做的原因：若在 UI 里手写一套 value，就会和服务端推断/提示词拼装用的键分叉，
 * 出现"界面选了但提示词里没有"的哑参数。测试会断言这里的键与契约完全一致。
 */

/** 水平方向（L angle_h）。 */
export const SHOT_ANGLE_H_OPTIONS: ShotConfigOption[] = Object.entries(angleContract.chineseLabel.horizontal).map(([value, label]) => ({ value, label }));

/** 俯仰（L angle_v）。 */
export const SHOT_ANGLE_V_OPTIONS: ShotConfigOption[] = Object.entries(angleContract.chineseLabel.elevation).map(([value, label]) => ({ value, label }));

/** 景别（L angle_s）。 */
export const SHOT_ANGLE_S_OPTIONS: ShotConfigOption[] = Object.entries(angleContract.chineseLabel.shotSize).map(([value, label]) => ({ value, label }));

/** 运镜中文名。键必须覆盖契约 movementEnums，测试会校验。 */
const MOVEMENT_LABELS: Record<string, string> = {
    static: "固定（少用）",
    push: "推镜",
    pull: "拉镜",
    pan: "横摇（左/右）",
    tilt: "纵摇（上/下）",
    tracking: "跟镜/跟踪",
    crane_up: "升镜（吊臂上升）",
    crane_dn: "降镜（吊臂下降）",
    orbit: "环绕/轨道",
    handheld: "手持",
};

export const SHOT_MOVEMENT_OPTIONS: ShotConfigOption[] = photographyContract.movementEnums.map((value) => ({ value, label: MOVEMENT_LABELS[value] || value }));

/** 灯光风格中文名。键必须覆盖契约 lightingRules 的所有 value。 */
const LIGHTING_LABELS: Record<string, string> = {
    natural: "自然光",
    front: "顺光",
    side: "侧光",
    backlit: "逆光",
    top: "顶光",
    under: "底光",
    soft: "柔光",
    dramatic: "戏剧光",
    neon: "霓虹光",
    golden_hour: "黄金时刻",
    blue_hour: "蓝调时刻",
    night: "夜景光",
};

export const SHOT_LIGHTING_OPTIONS: ShotConfigOption[] = [...new Set(photographyContract.lightingRules.map((rule) => rule.value))].map((value) => ({
    value,
    label: LIGHTING_LABELS[value] || value,
}));

/** 景深。这三个值是 inferOneClickPhotographyParams 实际会写入的取值。 */
export const SHOT_DEPTH_OF_FIELD_OPTIONS: ShotConfigOption[] = [
    { value: "shallow", label: "浅景深" },
    { value: "medium", label: "中景深" },
    { value: "deep", label: "深景深（全焦）" },
];
