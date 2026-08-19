import { BookMarked, Clapperboard, Compass, FileText, GalleryVerticalEnd, GraduationCap, Images, Maximize2, Presentation, School, Sparkles, UserRound } from "lucide-react";

import type { SchoolContext } from "@/lib/school-domain";

export const navigationGroups = [
    { id: "create", label: "创作" },
    { id: "projects", label: "项目" },
    { id: "assets", label: "资产" },
    { id: "community", label: "社区" },
] as const;

export const landingNavigationTools = [
    { slug: "create", label: "Agent" },
    { slug: "drama", label: "短剧" },
    { slug: "gallery", label: "广场" },
] as const;

export const navigationTools = [
    {
        slug: "create",
        label: "Agent",
        description: "统一创作入口",
        group: "create",
        icon: Sparkles,
        primary: true,
    },
    {
        slug: "canvas",
        label: "画布",
        description: "节点式多媒体创作",
        group: "projects",
        icon: Maximize2,
    },
    {
        slug: "drama",
        label: "短剧",
        description: "剧本、分镜与成片",
        group: "projects",
        icon: Clapperboard,
    },
    {
        slug: "works",
        label: "作品",
        description: "发布、审核与分享",
        group: "assets",
        icon: GalleryVerticalEnd,
    },
    {
        slug: "assets",
        label: "素材",
        description: "图片、视频与音频",
        group: "assets",
        icon: Images,
    },
    {
        slug: "my-prompts",
        label: "提示词",
        description: "个人提示词",
        group: "assets",
        icon: BookMarked,
    },
    {
        slug: "prompts",
        label: "词库",
        description: "公共提示词",
        group: "assets",
        icon: FileText,
    },
    {
        slug: "community",
        label: "广场",
        description: "发现公开作品",
        group: "community",
        icon: Compass,
    },
    {
        slug: "me",
        label: "主页",
        description: "已发布与我的喜欢",
        group: "community",
        icon: UserRound,
    },
] as const;

const practiceNavigationTool = {
    slug: "practice",
    label: "无限练习",
    description: "不扣积分的创作练习",
    group: "projects",
    icon: Sparkles,
} as const;

const teacherNavigationTool = {
    slug: "teaching",
    label: "教学中心",
    description: "班级、课程与批改",
    group: "school",
    icon: Presentation,
} as const;

const studentNavigationTool = {
    slug: "learning",
    label: "学习中心",
    description: "课程、作业与实训",
    group: "school",
    icon: GraduationCap,
} as const;

const schoolManagementNavigationTool = {
    slug: "school",
    label: "学校管理",
    description: "资料、成员与班级",
    group: "school",
    icon: School,
} as const;

export type RoleNavigationKey = "public" | "teacher" | "student" | "schoolAdmin";
export type RoleNavigationItem = {
    slug: string;
    label: string;
    description: string;
    group: string;
    route: string;
    access: string;
};

function roleNavigationItem(tool: { slug: string; label: string; description: string; group: string }, access: string): RoleNavigationItem {
    return { slug: tool.slug, label: tool.label, description: tool.description, group: tool.group, route: `/${tool.slug}`, access };
}

const publicRoleItems = navigationTools.map((tool) => roleNavigationItem(tool, "登录用户"));
const teacherRoleItems = [...publicRoleItems, roleNavigationItem(practiceNavigationTool, "学校 active 老师"), roleNavigationItem(teacherNavigationTool, "学校 active 老师")];
const studentRoleItems = [...publicRoleItems, roleNavigationItem(practiceNavigationTool, "学校 active 学生"), roleNavigationItem(studentNavigationTool, "学校 active 学生")];
const schoolAdminRoleItems = [
    ...publicRoleItems,
    roleNavigationItem(practiceNavigationTool, "学校 active 老师 + school.manage"),
    roleNavigationItem(teacherNavigationTool, "学校 active 老师 + school.manage"),
    roleNavigationItem(schoolManagementNavigationTool, "学校 active 老师 + school.manage"),
];

export const roleNavigationOverview: Record<RoleNavigationKey, { label: string; description: string; items: RoleNavigationItem[] }> = {
    public: { label: "普通 C 端用户", description: "仅可使用公开的用户端创作与资产功能。", items: publicRoleItems },
    teacher: { label: "教师端", description: "需要当前账号具备 active 学校老师身份。", items: teacherRoleItems },
    student: { label: "学生端", description: "需要当前账号具备 active 学校学生身份。", items: studentRoleItems },
    schoolAdmin: { label: "学校管理员端", description: "学校管理员以 teacher + school.manage 身份使用。", items: schoolAdminRoleItems },
};

export function schoolNavigationTools(context: SchoolContext | null) {
    if (!context || context.school.status !== "active" || context.membership.status !== "active") return [];
    if (context.membership.role === "student") {
        return [studentNavigationTool] as const;
    }
    return [teacherNavigationTool, ...(context.canManageSchool ? ([schoolManagementNavigationTool] as const) : [])] as const;
}

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"] | "learning" | "teaching" | "practice" | "school";
export type NavigationGroupId = (typeof navigationGroups)[number]["id"];

export function navigationToolsForContext(context: SchoolContext | null = null) {
    const schoolTools = schoolNavigationTools(context);
    return [...navigationTools, ...(schoolTools.length ? [practiceNavigationTool] : []), ...schoolTools];
}

export function navigationToolForPathname(pathname: string, context: SchoolContext | null = null) {
    const slug = pathname.split("/").filter(Boolean)[0];
    return navigationToolsForContext(context).find((tool) => tool.slug === slug);
}
