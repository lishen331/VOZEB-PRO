import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser, serializeModelCatalogSettings } from "@/lib/auth/session";

export const runtime = "nodejs";

// A1: 目录侧重配置从 /api/auth/session 拆出来单独下发。session 是身份态、每用户
// 不同、不可缓存；目录对所有账号一致、只随后台配置变，可缓存。压测里 437KB 的
// session 响应体几乎全是这部分，且 points.ts 在每次生成后都会重拉一次 session。
//
// 缓存时延：max-age 30 + stale-while-revalidate 300 叠加后旧配置最长可见约 330 秒，
// 不是 30 秒。对外不要承诺"30 秒内全量生效"，实际时延须实测。要更快生效应下调
// stale-while-revalidate 或加显式失效，而不是只调 max-age。
// 见 docs/plans/2026-09-20-capacity-phase1-fix-implementation.zh-CN.md 步骤 5。
const CATALOG_CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
    // A1-b 的收口不能被这个新 URL 绕开：上一步刚把未登录分支的重配置摘掉，如果
    // 这里不鉴权，匿名请求换个地址照样能拉走完整 logicalModels/systemChannels，
    // 等于白做。匿名用户无法发起生成，本来就不需要模型目录。
    // 注：这是对设计文档 2.3 的有意补充——原文只讲缓存，未提鉴权。
    let user = null;
    try {
        user = await getCurrentUser();
    } catch {
        user = null;
    }
    if (!user) return new Response(null, { status: 401 });

    const settings = await getAuthSettings();
    // 不传 user / plan / school：目录必须与身份无关，见 serializeModelCatalogSettings 的不变量注释。
    const catalog = serializeModelCatalogSettings(settings);
    const body = JSON.stringify(catalog);
    // 弱校验：同内容必须得到同 ETag，故直接哈希序列化后的响应体。形态对齐
    // local-media-response.ts:36 的 W/"..."。
    const etag = `W/"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;

    const ifNoneMatch = request.headers
        .get("if-none-match")
        ?.split(",")
        .map((value) => value.trim());
    if (ifNoneMatch?.includes(etag)) {
        return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": CATALOG_CACHE_CONTROL } });
    }

    return new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: etag, "Cache-Control": CATALOG_CACHE_CONTROL },
    });
}
