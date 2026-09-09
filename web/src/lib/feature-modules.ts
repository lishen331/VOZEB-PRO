import type { LucideIcon } from "lucide-react";
import { BookMarked, Clapperboard, CircleHelp, Compass, FileText, FlaskConical, GalleryVerticalEnd, GraduationCap, Images, Library, Maximize2, Presentation, School, Sparkles, UserRound } from "lucide-react";

export const FEATURE_MODULE_IDS = [
    "creative-agent",
    "canvas",
    "drama",
    "drama-lab",
    "practice",
    "works",
    "assets",
    "my-prompts",
    "prompt-library",
    "community",
    "ip-library",
    "creator-home",
    "teaching",
    "learning",
    "school-management",
    "help-center",
] as const;

export type FeatureModuleId = (typeof FEATURE_MODULE_IDS)[number];
export type FeatureModuleSettings = Record<FeatureModuleId, boolean>;
export type FeatureModuleGroup = "create" | "projects" | "assets" | "community" | "school" | "support";

export type FeatureModuleDefinition = {
    id: FeatureModuleId;
    name: string;
    description: string;
    group: FeatureModuleGroup;
    icon: LucideIcon;
    pathPrefixes: readonly string[];
    routeRoot?: string;
};

export const DEFAULT_FEATURE_MODULE_SETTINGS: FeatureModuleSettings = Object.fromEntries(FEATURE_MODULE_IDS.map((id) => [id, true])) as FeatureModuleSettings;

export const FEATURE_MODULES: readonly FeatureModuleDefinition[] = [
    { id: "creative-agent", name: "Agent", description: "统一创作与多模态任务入口", group: "create", icon: Sparkles, pathPrefixes: ["/create"], routeRoot: "create" },
    { id: "canvas", name: "画布", description: "节点式多媒体创作", group: "projects", icon: Maximize2, pathPrefixes: ["/canvas"], routeRoot: "canvas" },
    { id: "drama", name: "短剧", description: "剧本、分镜与成片项目", group: "projects", icon: Clapperboard, pathPrefixes: ["/drama"], routeRoot: "drama" },
    { id: "drama-lab", name: "创作工坊", description: "独立短剧生产工作流", group: "projects", icon: FlaskConical, pathPrefixes: ["/drama-lab"], routeRoot: "drama-lab" },
    { id: "practice", name: "练习", description: "学校场景下的创作练习", group: "projects", icon: Sparkles, pathPrefixes: ["/practice"], routeRoot: "practice" },
    { id: "works", name: "作品", description: "作品发布、审核与分享", group: "assets", icon: GalleryVerticalEnd, pathPrefixes: ["/works"], routeRoot: "works" },
    { id: "assets", name: "素材", description: "图片、视频、音频和素材库", group: "assets", icon: Images, pathPrefixes: ["/assets"], routeRoot: "assets" },
    { id: "my-prompts", name: "提示词", description: "个人提示词管理", group: "assets", icon: BookMarked, pathPrefixes: ["/my-prompts"], routeRoot: "my-prompts" },
    { id: "prompt-library", name: "词库", description: "公共提示词库", group: "assets", icon: FileText, pathPrefixes: ["/prompts"], routeRoot: "prompts" },
    { id: "community", name: "广场", description: "公共作品与社区内容", group: "community", icon: Compass, pathPrefixes: ["/community"], routeRoot: "community" },
    { id: "ip-library", name: "IP 库", description: "公共和学校 IP 内容", group: "community", icon: Library, pathPrefixes: ["/ip-library"], routeRoot: "ip-library" },
    { id: "creator-home", name: "主页", description: "个人发布与收藏内容", group: "community", icon: UserRound, pathPrefixes: ["/me"], routeRoot: "me" },
    { id: "teaching", name: "教学中心", description: "教师课程、班级与批改", group: "school", icon: Presentation, pathPrefixes: ["/teaching"], routeRoot: "teaching" },
    { id: "learning", name: "学习中心", description: "学生课程、作业与实训", group: "school", icon: GraduationCap, pathPrefixes: ["/learning"], routeRoot: "learning" },
    { id: "school-management", name: "学校管理", description: "学校资料、成员与班级", group: "school", icon: School, pathPrefixes: ["/school"], routeRoot: "school" },
    { id: "help-center", name: "帮助中心", description: "前台使用帮助与教程", group: "support", icon: CircleHelp, pathPrefixes: ["/help"], routeRoot: "help" },
] as const;

const modulesById = new Map(FEATURE_MODULES.map((module) => [module.id, module]));
const modulesByRouteRoot = new Map(FEATURE_MODULES.filter((module) => module.routeRoot).map((module) => [module.routeRoot!, module.id]));

export function featureModuleDefinition(id: FeatureModuleId) {
    return modulesById.get(id)!;
}

export function normalizeFeatureModuleSettings(value: unknown): FeatureModuleSettings {
    const input = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    return Object.fromEntries(FEATURE_MODULE_IDS.map((id) => [id, input[id] !== false])) as FeatureModuleSettings;
}

export function isFeatureModuleEnabled(settings: Pick<{ featureModules: FeatureModuleSettings }, "featureModules">, id: FeatureModuleId) {
    return settings.featureModules[id] !== false;
}

export function featureModuleForPathname(pathname: string): FeatureModuleId | undefined {
    const root = pathname.split("/").filter(Boolean)[0];
    return root ? modulesByRouteRoot.get(root) : undefined;
}

export function featureModuleForNavigationSlug(slug: string): FeatureModuleId | undefined {
    return featureModuleForPathname(`/${slug}`);
}
