import type { FeatureModuleId, FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";
import { appStorageKey } from "@/lib/storage-keys";

/*
 * 首次使用引导（首页 3 屏）。
 *
 * 设计约束：
 *   1. 步骤是数据不是硬编码 JSX —— 内容按当前用户实际可见的功能模块生成，
 *      后台关掉某个模块后，用户不会再看到指向不存在入口的引导。
 *   2. 版本号带可见模块签名 —— 管理员新开一个模块，签名变化，老用户会重看一次针对新组合的引导。
 *   3. 全部步骤被过滤掉时不弹（返回空数组由调用方跳过）。
 *
 * 注意：这里只负责「看到什么」，不负责「要不要弹」。是否展示由组件按 localStorage 判断。
 */

export type OnboardingBullet = { label: string; detail: string };

export type OnboardingStep = {
    id: string;
    title: string;
    description: string;
    bullets: OnboardingBullet[];
};

export type OnboardingContext = {
    featureModules?: FeatureModuleSettings;
    menuPermissions?: readonly UserNavigationMenuPermission[];
    schoolContext?: SchoolContext | null;
};

export const GUIDE_VERSION = "v1";

export function hasActiveSchoolRole(context: SchoolContext | null | undefined) {
    return Boolean(context?.school.status === "active" && context?.membership.status === "active" && (context.membership.role === "teacher" || context.membership.role === "student"));
}

function moduleVisible(id: FeatureModuleId, context: OnboardingContext) {
    if (context.featureModules?.[id] === false) return false;
    if (!context.menuPermissions) return true;
    return context.menuPermissions.includes(id as UserNavigationMenuPermission);
}

/** 生成当前用户该看的引导步骤；返回空数组表示没有可讲的内容，调用方应直接跳过 */
export function buildOnboardingSteps(context: OnboardingContext = {}): OnboardingStep[] {
    const seesSchool = hasActiveSchoolRole(context.schoolContext);
    const seesPractice = moduleVisible("practice", context) && seesSchool;
    const seesCreate = moduleVisible("creative-agent", context);
    const seesDrama = moduleVisible("drama", context) || moduleVisible("drama-lab", context) || moduleVisible("one-click-film", context);
    const seesCanvas = moduleVisible("canvas", context);
    const seesAssets = moduleVisible("assets", context) || moduleVisible("works", context);

    const steps: OnboardingStep[] = [];

    // 第一屏：整体分区。只有确实能看到两个以上板块时才有意义。
    const areas: OnboardingBullet[] = [];
    if (seesSchool) areas.push({ label: "学校", detail: "课程、班级、作业与批改，教学侧的管理都在这里。" });
    if (seesPractice) areas.push({ label: "无限练习", detail: "单块技能的专项训练，各模块互不串联，适合先熟悉手感。" });
    if (seesCreate) areas.push({ label: "创作", detail: "Agent、短剧、画布、一键成片，是完整的一条制作流水线。" });
    if (seesAssets) areas.push({ label: "资产", detail: "作品、素材和提示词。生成的东西都回收到这里继续用。" });

    if (areas.length >= 2) {
        steps.push({
            id: "areas",
            title: "先认清左侧这几块",
            description: "它们是四件不同的事，不是同一个东西的不同入口。",
            bullets: areas,
        });
    }

    // 第二屏：从哪开始。按用户实际拥有的入口给建议，避免指向看不见的东西。
    const starts: OnboardingBullet[] = [];
    if (seesPractice) starts.push({ label: "想先试试手感", detail: "去「无限练习」挑一个模块，单次生成，不会牵动整个项目。" });
    if (seesCreate) starts.push({ label: "有明确的需求", detail: "去「AI 创作」，把目标、受众、用途写清楚，一句话也能起步。" });
    if (seesDrama) starts.push({ label: "要做一个完整作品", detail: "去「短剧制作」或「一键成片」，从剧本一路做到成片。" });
    if (seesCanvas) starts.push({ label: "想自由拼装", detail: "去「无限画布」，节点式地把文字、图片、视频连起来。" });

    if (starts.length) {
        steps.push({
            id: "start",
            title: "那第一步该点哪",
            description: "按你手上的事选一条，不用全都会用。",
            bullets: starts,
        });
    }

    // 第三屏：积分。这是新用户最不敢按的地方，必须讲清楚。
    steps.push({
        id: "points",
        title: "积分怎么花，失败了怎么办",
        description: "生成会消耗积分，但失败不吞分。",
        bullets: [
            { label: "按次扣费", detail: "每次生成前会显示预计消耗，确认后才提交。" },
            { label: "失败自动退", detail: "任务失败时积分会实时退回，不需要找客服。" },
            { label: "随时可查", detail: "侧栏底部能看到余额，点进去是套餐与积分记录。" },
        ],
    });

    return steps;
}

/**
 * 可见模块签名：用户能看到的功能组合变了，引导就要重看一次。
 * 只把会影响引导内容的模块纳入，避免无关开关变化导致重复打扰。
 */
export function onboardingSignature(context: OnboardingContext = {}) {
    const parts = [
        hasActiveSchoolRole(context.schoolContext) ? "school" : "",
        moduleVisible("practice", context) ? "practice" : "",
        moduleVisible("creative-agent", context) ? "create" : "",
        moduleVisible("canvas", context) ? "canvas" : "",
        moduleVisible("drama", context) ? "drama" : "",
        moduleVisible("drama-lab", context) ? "drama-lab" : "",
        moduleVisible("one-click-film", context) ? "one-click-film" : "",
        moduleVisible("assets", context) ? "assets" : "",
        moduleVisible("works", context) ? "works" : "",
    ].filter(Boolean);
    return parts.join(".") || "none";
}

/** localStorage 键：版本 + 签名，内容或可见模块变化时自动作废 */
export function onboardingStorageKey(context: OnboardingContext = {}) {
    return appStorageKey(`onboarding:${GUIDE_VERSION}:${onboardingSignature(context)}`);
}

/** 已看过返回 true。读取失败（隐私模式）按已看过处理，避免每次刷新都弹 */
export function hasSeenOnboarding(context: OnboardingContext = {}) {
    if (typeof window === "undefined") return true;
    try {
        return window.localStorage.getItem(onboardingStorageKey(context)) === "done";
    } catch {
        return true;
    }
}

export function markOnboardingSeen(context: OnboardingContext = {}) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(onboardingStorageKey(context), "done");
    } catch {
        // 隐私模式下写不进去：本次会话内不再弹即可，不打断用户
    }
}
