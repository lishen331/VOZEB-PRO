import { NextRequest, NextResponse } from "next/server";

import { postgresQuery } from "@/lib/server/database";
import { readJsonBody } from "@/lib/auth/request";
import { authorizeDramaLabAdmin, badRequest, integerValue, serverError } from "../_lib";

const DEFAULT_SETTINGS = {
    imageConcurrency: 3,
    videoConcurrency: 1,
    maxBatchSize: 10,
    imageTimeout: 180,
    videoTimeout: 1800,
};

function serializeSettings(row: Record<string, unknown> | undefined) {
    if (!row) return DEFAULT_SETTINGS;
    return {
        imageConcurrency: Number(row.image_concurrency),
        videoConcurrency: Number(row.video_concurrency),
        maxBatchSize: Number(row.max_batch_size),
        imageTimeout: Number(row.image_timeout),
        videoTimeout: Number(row.video_timeout),
    };
}

export async function GET() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const result = await postgresQuery(
            `SELECT image_concurrency, video_concurrency, max_batch_size, image_timeout, video_timeout
             FROM drama_lab_generation_settings WHERE user_id = $1`,
            [auth.user.id],
        );
        return NextResponse.json({ code: 0, data: serializeSettings(result.rows[0] as Record<string, unknown> | undefined) });
    } catch (error) {
        console.error("Failed to load drama lab generation settings", error);
        return serverError();
    }
}

export async function PUT(request: NextRequest) {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        const body = await readJsonBody<Record<string, unknown>>(request, 16 * 1024);
        const imageConcurrency = integerValue(body.imageConcurrency, 1, 32);
        const videoConcurrency = integerValue(body.videoConcurrency, 1, 16);
        const maxBatchSize = integerValue(body.maxBatchSize, 1, 100);
        const imageTimeout = integerValue(body.imageTimeout, 10, 3600);
        const videoTimeout = integerValue(body.videoTimeout, 30, 7200);
        if (imageConcurrency === null || videoConcurrency === null || maxBatchSize === null || imageTimeout === null || videoTimeout === null) {
            return badRequest("Invalid generation settings");
        }

        const result = await postgresQuery(
            `INSERT INTO drama_lab_generation_settings
                (id, user_id, image_concurrency, video_concurrency, max_batch_size, image_timeout, video_timeout, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (user_id) DO UPDATE SET
                image_concurrency = EXCLUDED.image_concurrency,
                video_concurrency = EXCLUDED.video_concurrency,
                max_batch_size = EXCLUDED.max_batch_size,
                image_timeout = EXCLUDED.image_timeout,
                video_timeout = EXCLUDED.video_timeout,
                updated_at = NOW()
             RETURNING image_concurrency, video_concurrency, max_batch_size, image_timeout, video_timeout`,
            [auth.user.id, auth.user.id, imageConcurrency, videoConcurrency, maxBatchSize, imageTimeout, videoTimeout],
        );
        return NextResponse.json({ code: 0, data: serializeSettings(result.rows[0] as Record<string, unknown>) });
    } catch (error) {
        console.error("Failed to save drama lab generation settings", error);
        return serverError();
    }
}

export async function POST(request: NextRequest) {
    return PUT(request);
}

export async function DELETE() {
    const auth = await authorizeDramaLabAdmin();
    if ("response" in auth) return auth.response;

    try {
        await postgresQuery("DELETE FROM drama_lab_generation_settings WHERE user_id = $1", [auth.user.id]);
        return NextResponse.json({ code: 0, data: DEFAULT_SETTINGS, msg: "Generation settings reset" });
    } catch (error) {
        console.error("Failed to reset drama lab generation settings", error);
        return serverError();
    }
}
