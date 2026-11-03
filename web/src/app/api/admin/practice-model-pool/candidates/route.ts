import { NextRequest, NextResponse } from "next/server";
import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { rawModelName } from "@/lib/server/generation-channel";
import { channelModelCapability, channelUsableForSurface, resolveLogicalModelCapabilityProfile } from "@/lib/model-routing-config";
import { practicePoolIncludes } from "@/lib/server/runninghub-workflow-runtime";
import type { LogicalModelCapability, PracticePoolKind } from "@/lib/auth/store-types";

export const dynamic = "force-dynamic";

export type PracticePoolCandidate = {
    upstreamModel: string;
    /** 上游模型名的小写形式，也是池子里记录的键。 */
    modelKey: string;
    capability: LogicalModelCapability;
    supportsImageInput: boolean;
    channelId: string;
    channelName: string;
    purpose: string;
    inPool: boolean;
};

export type PracticePoolStats = {
    total: number;
    inPool: number;
};

export const PRACTICE_POOL_KINDS: PracticePoolKind[] = ["text", "vision", "image", "video", "audio"];

/**
 * GET /api/admin/practice-model-pool/candidates
 *
 * 按能力返回五个池子的候选与勾选状态。
 * 候选 = 练习开关打开的渠道 / 共享渠道里的模型；每个模型只会进它能力对应的池，
 * 文本模型另外看是否声明了图片输入——支持的话同时进 vision 池。
 */
export async function GET(request: NextRequest) {
    const user = await getCurrentUser(request);
    if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const settings = await getAuthSettings();
    const poolConfig = settings.practiceModelPool;

    const pools = Object.fromEntries(PRACTICE_POOL_KINDS.map((kind) => [kind, [] as PracticePoolCandidate[]])) as Record<PracticePoolKind, PracticePoolCandidate[]>;
    const stats = Object.fromEntries(PRACTICE_POOL_KINDS.map((kind) => [kind, { total: 0, inPool: 0 }])) as Record<PracticePoolKind, PracticePoolStats>;

    for (const channel of settings.systemChannels.filter((item) => channelUsableForSurface(item, "open-source-practice"))) {
        for (const model of channel.models) {
            const modelName = rawModelName(model);
            const modelKey = modelName.toLowerCase();
            const capability = channelModelCapability(channel, model);
            const supportsImageInput = resolveLogicalModelCapabilityProfile({}, capability === "text" ? "text" : capability, channel, modelName)?.supportsImageInput === true;

            const kinds: PracticePoolKind[] = [capability as PracticePoolKind];
            if (capability === "text" && supportsImageInput) kinds.push("vision");

            for (const kind of kinds) {
                pools[kind].push({
                    upstreamModel: modelName,
                    modelKey,
                    capability,
                    supportsImageInput,
                    channelId: channel.id,
                    channelName: channel.name || channel.id,
                    purpose: channel.purpose || "",
                    inPool: practicePoolIncludes(poolConfig, kind, modelKey),
                });
                stats[kind].total += 1;
                if (practicePoolIncludes(poolConfig, kind, modelKey)) stats[kind].inPool += 1;
            }
        }
    }

    return NextResponse.json({ pools, stats });
}
