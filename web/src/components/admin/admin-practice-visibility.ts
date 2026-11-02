import type { PracticeModuleVisibility } from "@/lib/auth/store";

/**
 * 无限练习的模块显隐默认值。
 *
 * 两个后台页面（插件市场、无限练习）编辑的是同一份 `practiceModuleVisibility`，
 * 这里做唯一来源：任何一侧保存时都以它为底再叠加服务端当前值，避免一侧把另一侧刚打开的开关重置回默认。
 *
 * canvas / drama 是「显式开启」语义（默认关），其余 6 个是「默认开、可关」语义。
 */
export const DEFAULT_PRACTICE_MODULE_VISIBILITY: PracticeModuleVisibility = {
    canvas: false,
    drama: false,
    character: true,
    scene: true,
    prop: true,
    "storyboard-image": true,
    "storyboard-video": true,
    dubbing: true,
};

export function practiceVisibilityMerged(value: PracticeModuleVisibility | undefined): PracticeModuleVisibility {
    return { ...DEFAULT_PRACTICE_MODULE_VISIBILITY, ...(value || {}) };
}

/** 切换单个模块，保留其余模块（含另一后台页面刚保存的值）不动。 */
export function applyPracticeVisibilityToggle(current: PracticeModuleVisibility | undefined, key: keyof PracticeModuleVisibility, checked: boolean): PracticeModuleVisibility {
    return { ...practiceVisibilityMerged(current), [key]: checked };
}
