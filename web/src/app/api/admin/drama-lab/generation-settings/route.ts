import { NextResponse } from "next/server";

import { getFreshAuthSettings, type AuthSettings } from "@/lib/auth/store";
import { authorizeDramaLabAdmin, legacyReadOnly, serverError } from "../_lib";

/** Compatibility defaults retained for the old Drama Lab admin surface. */
export const DEFAULT_SETTINGS = {
    imageConcurrency: 3,
    videoConcurrency: 1,
    maxBatchSize: 10,
    imageTimeout: 180,
    videoTimeout: 1800,
} as const;

type LegacyGenerationSettings = {
    imageConcurrency: number;
    videoConcurrency: number;
    maxBatchSize: number;
    imageTimeout: number;
    videoTimeout: number;
};

function positiveIntegerOr(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function serializeSettings(settings: Partial<AuthSettings> | undefined): LegacyGenerationSettings {
    const concurrency = settings?.generationConcurrency;
    const defaults = settings?.generationDefaults;
    return {
        imageConcurrency: positiveIntegerOr(concurrency?.image, DEFAULT_SETTINGS.imageConcurrency),
        videoConcurrency: positiveIntegerOr(concurrency?.video, DEFAULT_SETTINGS.videoConcurrency),
        maxBatchSize: positiveIntegerOr(defaults?.dramaMaxBatchSize, DEFAULT_SETTINGS.maxBatchSize),
        imageTimeout: positiveIntegerOr(defaults?.dramaImageTimeoutSeconds, DEFAULT_SETTINGS.imageTimeout),
        videoTimeout: positiveIntegerOr(defaults?.dramaVideoTimeoutSeconds, DEFAULT_SETTINGS.videoTimeout),
    };
}

export async function GET() {
    const auth = await authorizeDramaLabAdmin(["content.manage", "upstream.manage"]);
    if ("response" in auth) return auth.response;

    try {
        const settings = await getFreshAuthSettings();
        return NextResponse.json({ code: 0, data: serializeSettings(settings) });
    } catch (error) {
        console.error("Failed to load drama lab generation settings", error);
        return serverError();
    }
}

export async function PUT() {
    const auth = await authorizeDramaLabAdmin(["upstream.manage"]);
    if ("response" in auth) return auth.response;
    return legacyReadOnly("Legacy generation settings are read-only; use the platform generation controls.");
}

export async function POST() {
    const auth = await authorizeDramaLabAdmin(["upstream.manage"]);
    if ("response" in auth) return auth.response;
    return legacyReadOnly("Legacy generation settings are read-only; use the platform generation controls.");
}

export async function DELETE() {
    const auth = await authorizeDramaLabAdmin(["upstream.manage"]);
    if ("response" in auth) return auth.response;
    return legacyReadOnly("Legacy generation settings are read-only; use the platform generation controls.");
}
