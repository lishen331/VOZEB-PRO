import type { GammaNavIconName } from "@/components/gamma-ui/gamma-nav-icon";
import { navigationToolsForContext } from "@/constant/navigation-tools";
import type { FeatureModuleSettings, UserNavigationMenuPermission } from "@/lib/feature-modules";
import type { SchoolContext } from "@/lib/school-domain";

/*
 * 布鲁伽马侧栏的唯一数据源：首页与所有工作空间页面共用。
 * 能看到哪些入口仍由 navigationToolsForContext 决定（功能模块开关 + 角色菜单权限 + 学校身份），
 * 这里只负责排序、分组和新版文案 / 图标，所以后台关掉的模块、没有权限的角色都不会出现。
 */

/**
 * 侧栏分组，相邻分组之间自动出现分隔线。
 * 学校身份（老师 / 学生）先看到自己学校的入口（school），中间隔开，才是练习（practice）与创作（create）。
 */
export type WorkspaceNavGroup = "home" | "school" | "practice" | "create" | "assets" | "community";

export type WorkspaceNavItem = {
    key: string;
    label: string;
    icon: GammaNavIconName;
    href: string;
    group: WorkspaceNavGroup;
};

type Entry = { slug: string; label: string; icon: GammaNavIconName; group: WorkspaceNavGroup };

/**
 * 展示顺序即侧栏顺序；slug 与 navigation-tools 一致。
 * 学校身份（老师 / 学生 / 学校管理员）才会出现，紧跟在首页后面单独成组；
 * 无限练习属于练习区，与学校板块之间用分隔线隔开。
 * 作品广场（/gallery、/community）不进侧栏，从首页作品区「全部作品」进入；两个页面本身仍可访问。
 */
const ENTRIES: readonly Entry[] = [
    { slug: "teaching", label: "教学中心", icon: "teaching", group: "school" },
    { slug: "learning", label: "学习中心", icon: "learning", group: "school" },
    { slug: "school", label: "学校管理", icon: "school", group: "school" },
    { slug: "practice", label: "无限练习", icon: "practice", group: "practice" },
    { slug: "create", label: "AI 创作", icon: "subjects", group: "create" },
    { slug: "drama", label: "短剧制作", icon: "courseware", group: "create" },
    { slug: "canvas", label: "无限画布", icon: "canvas", group: "create" },
    { slug: "drama-lab", label: "创作工坊", icon: "workshop", group: "create" },
    { slug: "one-click-film", label: "一键成片", icon: "film", group: "create" },
    { slug: "works", label: "我的作品", icon: "works", group: "assets" },
    { slug: "assets", label: "我的素材", icon: "assets", group: "assets" },
    { slug: "my-prompts", label: "我的提示词", icon: "library", group: "assets" },
    { slug: "prompts", label: "提示词库", icon: "prompts", group: "assets" },
    { slug: "ip-library", label: "IP 库", icon: "ip", group: "community" },
    { slug: "me", label: "我的主页", icon: "profile", group: "community" },
];

export type WorkspaceNavOptions = {
    schoolContext?: SchoolContext | null;
    featureModules?: FeatureModuleSettings;
    /** 未登录时不传：按全部菜单权限展示，点进去再登录 */
    menuPermissions?: readonly UserNavigationMenuPermission[];
};

export function workspaceNavItems({ schoolContext = null, featureModules, menuPermissions }: WorkspaceNavOptions = {}): WorkspaceNavItem[] {
    const allowed = new Set<string>(navigationToolsForContext(schoolContext, { featureModules, menuPermissions }).map((tool) => tool.slug));
    const visible = ENTRIES.filter((entry) => allowed.has(entry.slug)).map<WorkspaceNavItem>((entry) => ({ key: entry.slug, label: entry.label, icon: entry.icon, href: `/${entry.slug}`, group: entry.group }));
    const hasSchool = visible.some((item) => item.group === "school");
    // 没有学校入口时，首页并入创作组，免得顶上孤零零一条分隔线
    const home: WorkspaceNavItem = { key: "home", label: "首页", icon: "home", href: "/", group: hasSchool ? "home" : "create" };
    return [home, ...visible];
}

/** 帮助中心不放在导航列表里，由侧栏底部操作区单独展示 */
export function isHelpCenterVisible(featureModules?: FeatureModuleSettings, menuPermissions?: readonly UserNavigationMenuPermission[]) {
    return featureModules?.["help-center"] !== false && (!menuPermissions || menuPermissions.includes("help-center"));
}

/** 当前路径对应的侧栏选中项（没有对应入口时返回空字符串，例如 /profile、/billing） */
export function workspaceNavActiveKey(pathname: string, items: readonly WorkspaceNavItem[]) {
    const root = pathname.split("/").filter(Boolean)[0];
    if (!root) return "home";
    return items.find((item) => item.key === root)?.key ?? "";
}
