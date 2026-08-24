import { mkdir } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

import { NextResponse } from "next/server";

import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import type { DramaLabPromptCategory } from "@/lib/drama-lab-prompt-templates";
import { getCurrentUser } from "@/lib/auth/session";
import { ensurePostgresSchema, getDatabaseProvider } from "@/lib/server/database";
import { getServerDataDir } from "@/lib/server/data-dir";

export const PROMPT_CATEGORIES = ["script", "character", "scene", "prop", "storyboard", "image", "video"] as const;
export const SD2_ASSET_TYPES = ["lora", "checkpoint", "vae"] as const;
const SD2_ASSET_EXTENSIONS = new Set([".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".vae"]);

export type PromptCategory = DramaLabPromptCategory | "video";
export type Sd2AssetType = (typeof SD2_ASSET_TYPES)[number];

type DramaLabAdmin = Awaited<ReturnType<typeof getCurrentUser>>;

export async function authorizeDramaLabAdmin() {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return { response: NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 }) };
    }
    if (getDatabaseProvider() !== "postgres") {
        return { response: NextResponse.json({ code: 503, msg: "Database not configured" }, { status: 503 }) };
    }
    try {
        await ensurePostgresSchema();
    } catch (error) {
        console.error("Failed to initialize drama lab schema", error);
        return { response: NextResponse.json({ code: 503, msg: "Database schema is not ready" }, { status: 503 }) };
    }
    return { user: user as NonNullable<DramaLabAdmin> };
}

export function badRequest(msg: string) {
    return NextResponse.json({ code: 400, msg }, { status: 400 });
}

export function serverError(msg = "Internal Server Error") {
    return NextResponse.json({ code: 500, msg }, { status: 500 });
}

export function notFound(msg = "Resource not found") {
    return NextResponse.json({ code: 404, msg }, { status: 404 });
}

export function textValue(value: unknown, maxLength: number, required = false) {
    if (typeof value !== "string") return required ? null : undefined;
    const normalized = value.trim();
    if (!normalized) return required ? null : undefined;
    return normalized.slice(0, maxLength);
}

export function integerValue(value: unknown, minimum: number, maximum: number) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) return null;
    return parsed;
}

export function objectValue(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function stringArrayValue(value: unknown, maxItems = 50, maxItemLength = 120) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return null;
    const values = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maxItemLength))
        .filter(Boolean);
    if (values.length !== value.length || values.length > maxItems) return null;
    return Array.from(new Set(values));
}

export function promptCategory(value: unknown): PromptCategory | null {
    return typeof value === "string" && (PROMPT_CATEGORIES as readonly string[]).includes(value) ? (value as PromptCategory) : null;
}

export function sd2AssetType(value: unknown): Sd2AssetType | null {
    return typeof value === "string" && (SD2_ASSET_TYPES as readonly string[]).includes(value) ? (value as Sd2AssetType) : null;
}

export function isSd2AssetFileName(fileName: string) {
    return SD2_ASSET_EXTENSIONS.has(extname(fileName).toLowerCase());
}

export function validAspectRatio(value: unknown) {
    return typeof value === "string" && /^\d{1,3}:\d{1,3}$/.test(value.trim()) ? value.trim() : null;
}

export function validResolution(value: unknown) {
    return typeof value === "string" && /^\d{3,5}x\d{3,5}$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
}

export const SD2_ASSET_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SD2_ASSET_RELATIVE_ROOT = "drama-lab/sd2-assets";

export function sd2StorageKey(userId: string, assetId: string, fileName: string) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160) || "asset.bin";
    return `${SD2_ASSET_RELATIVE_ROOT}/${userId}/${assetId}-${safeName}`;
}

export function sd2StoragePath(storageKey: string) {
    const root = resolve(getServerDataDir(), SD2_ASSET_RELATIVE_ROOT);
    const target = resolve(getServerDataDir(), storageKey);
    const relativeTarget = relative(root, target);
    if (!relativeTarget || relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) throw new Error("Invalid SD2 asset path");
    return { root, target };
}

export async function ensureSd2AssetDirectory(storageKey: string) {
    const { target } = sd2StoragePath(storageKey);
    await mkdir(resolve(target, ".."), { recursive: true });
    return target;
}

export function fileNameForDownload(name: string) {
    return name.replace(/[\r\n"\\/]/g, "_").slice(0, 255) || "sd2-asset";
}
