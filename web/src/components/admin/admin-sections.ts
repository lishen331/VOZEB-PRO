import { hasAnyAdminPermission, type AdminPermission } from "@/lib/admin-permissions";

export const ADMIN_SECTION_KEYS = [
    "overview",
    "schools",
    "schoolCompute",
    "courses",
    "commercialOrders",
    "site",
    "channels",
    "practice",
    "skills",
    "plugins",
    "dramaLabPlugin",
    "settings",
    "roleOverview",
    "roleManagement",
    "administratorManagement",
    "accountDeletion",
    "mediaStorage",
    "externalStorage",
    "backup",
    "points",
    "wallet",
    "orders",
    "products",
    "promotions",
    "coupons",
    "referrals",
    "payments",
    "updates",
    "cdk",
    "announcements",
    "ipLibrary",
    "works",
    "users",
    "logs",
    "generationOperations",
    "prompts",
    "adminHelp",
    "dramaProjects",
    "dramaLabConfig",
    "dramaLabPrompts",
    "dramaLabScenarios",
    "dramaLabGeneration",
    "dramaLabSd2",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

export const ADMIN_MENU_PERMISSION_PREFIX = "admin.menu.";
export type AdminMenuPermission = string;

export function adminMenuPermission(section: AdminSectionKey): AdminMenuPermission {
    return ADMIN_MENU_PERMISSION_PREFIX + section;
}

const adminMenuPermissionKeys = new Set<AdminMenuPermission>(ADMIN_SECTION_KEYS.map(adminMenuPermission));

export function normalizeAdminMenuPermissions(value: unknown): AdminMenuPermission[] {
    if (!Array.isArray(value)) return [];
    const selected = new Set(value.filter((item): item is AdminMenuPermission => typeof item === "string" && adminMenuPermissionKeys.has(item)));
    return ADMIN_SECTION_KEYS.filter((section) => selected.has(adminMenuPermission(section))).map(adminMenuPermission);
}

export const ADMIN_SECTION_PERMISSIONS: Record<AdminSectionKey, readonly AdminPermission[]> = {
    overview: ["analytics.read", "commerce.manage", "generation.read", "billing.read", "billing.manage"],
    schools: ["education.manage"],
    schoolCompute: ["education.manage", "billing.manage"],
    courses: ["education.manage"],
    commercialOrders: ["education.manage"],
    users: ["users.read", "users.manage"],
    logs: ["generation.read", "generation.manage"],
    generationOperations: ["generation.manage"],
    products: ["commerce.manage"],
    promotions: ["commerce.manage"],
    coupons: ["commerce.manage"],
    referrals: ["commerce.manage"],
    orders: ["billing.read", "billing.manage"],
    points: ["billing.manage"],
    payments: ["billing.manage"],
    cdk: ["billing.manage"],
    wallet: ["billing.read", "billing.manage"],
    channels: ["upstream.manage"],
    practice: ["upstream.manage"],
    skills: ["upstream.manage"],
    plugins: ["upstream.manage"],
    dramaLabPlugin: ["upstream.manage"],
    site: ["system.manage"],
    settings: ["system.manage", "upstream.manage"],
    roleOverview: ["system.manage"],
    roleManagement: ["administrators.manage"],
    administratorManagement: ["administrators.manage"],
    accountDeletion: ["users.manage"],
    mediaStorage: ["system.manage"],
    externalStorage: ["system.manage"],
    backup: ["system.manage"],
    announcements: ["content.manage"],
    ipLibrary: ["content.manage", "education.manage"],
    works: ["content.manage"],
    prompts: ["content.manage"],
    updates: [],
    adminHelp: [],
    dramaProjects: ["content.manage"],
    dramaLabConfig: ["content.manage"],
    dramaLabPrompts: ["content.manage"],
    dramaLabScenarios: ["content.manage"],
    dramaLabGeneration: ["upstream.manage"],
    dramaLabSd2: ["content.manage"],
};

const adminSectionKeys = new Set<AdminSectionKey>(ADMIN_SECTION_KEYS);

export function parseAdminSection(value: string | string[] | undefined): AdminSectionKey {
    const section = Array.isArray(value) ? value[0] : value;
    return adminSectionKeys.has(section as AdminSectionKey) ? (section as AdminSectionKey) : "overview";
}

export function adminSectionHref(section: AdminSectionKey, currentHref = "/admin") {
    const url = new URL(currentHref, "http://localhost");
    if (section === "overview") url.searchParams.delete("section");
    else url.searchParams.set("section", section);
    return `${url.pathname}${url.search}${url.hash}`;
}

export function adminMenuPermissionsFromLegacy(value: unknown): AdminMenuPermission[] {
    const direct = normalizeAdminMenuPermissions(value);
    if (direct.length) return direct;
    const permissions = Array.isArray(value) ? value : [];
    const hasLegacyPermission = hasAnyAdminPermission({ role: "admin", status: "active", adminPermissions: permissions });
    if (!hasLegacyPermission) return [];
    return ADMIN_SECTION_KEYS.filter((section) => {
        const required = ADMIN_SECTION_PERMISSIONS[section];
        return required.length ? required.some((permission) => permissions.includes(permission)) : true;
    }).map(adminMenuPermission);
}

export function adminDutiesFromMenuPermissions(value: unknown): AdminPermission[] {
    const menuPermissions = normalizeAdminMenuPermissions(value);
    const duties = new Set<AdminPermission>();
    menuPermissions.forEach((permission) => {
        const section = permission.slice(ADMIN_MENU_PERMISSION_PREFIX.length) as AdminSectionKey;
        ADMIN_SECTION_PERMISSIONS[section].forEach((duty) => duties.add(duty));
    });
    return [...duties];
}

export function normalizePlatformMenuPermissions(value: unknown): AdminMenuPermission[] {
    const direct = normalizeAdminMenuPermissions(value);
    if (direct.length) return direct;
    return adminMenuPermissionsFromLegacy(value);
}

export function canAccessAdminSection(user: { role?: unknown; status?: unknown; adminPermissions?: unknown; adminMenuPermissions?: unknown }, section: AdminSectionKey) {
    const menuPermissions = normalizeAdminMenuPermissions(user.adminMenuPermissions);
    if (menuPermissions.length) return menuPermissions.includes(adminMenuPermission(section));
    const permissions = ADMIN_SECTION_PERMISSIONS[section];
    return hasAnyAdminPermission(user, permissions.length ? permissions : undefined);
}

export function allowedAdminSections(user: { role?: unknown; status?: unknown; adminPermissions?: unknown; adminMenuPermissions?: unknown }) {
    return ADMIN_SECTION_KEYS.filter((section) => canAccessAdminSection(user, section));
}

export function resolveAdminSection(user: { role?: unknown; status?: unknown; adminPermissions?: unknown; adminMenuPermissions?: unknown }, requested: AdminSectionKey) {
    if (canAccessAdminSection(user, requested)) return requested;
    return allowedAdminSections(user)[0];
}
