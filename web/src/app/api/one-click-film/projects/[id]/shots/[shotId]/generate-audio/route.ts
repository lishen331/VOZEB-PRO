import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { DramaLabAudioKind } from "@/lib/server/drama-lab-audio-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { runOneClickAudioForEpisodes } from "@/lib/server/one-click-film/audio-runner";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 单镜配音，对应 L `onTtsSbDialogue`（对白配音）与 `onTtsSbNarration`（解说配音）。
 *
 * 复用 `runOneClickAudioForEpisodes` 并只传该分镜与该音轨类型，**不复制一份 TTS 逻辑**：
 * 上游 context 的 `featureModule: "one-click-film"` 只能有一处来源，一旦分叉就容易漏写，
 * 把商单用量记到教学版账上（这类计费归属 bug 已经出现过一次，见 docs 记忆文件）。
 *
 * 沿用 runner 的既有语义：已有音频直接跳过不重复扣费、进行中的任务只轮询、
 * 没有对白/旁白文本的镜头直接跳过而不算失败。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });

    try {
        const { id, shotId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) return NextResponse.json({ code: 400, data: null, msg: "当前剧集不能为空" }, { status: 400 });

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const episode = project.episodes.find((item) => item.id === episodeId);
        if (!episode) return NextResponse.json({ code: 404, data: null, msg: "当前剧集不存在" }, { status: 404 });
        const shot = episode.shots.find((item) => item.id === shotId);
        if (!shot) return NextResponse.json({ code: 404, data: null, msg: "当前分镜不存在" }, { status: 404 });

        // L 的两个按钮各自只做一条音轨，所以这里必须能指定 kind。
        const body = (await readJsonBody(request).catch(() => ({}))) as { kind?: unknown };
        const kind: DramaLabAudioKind | undefined = body.kind === "dialogue" || body.kind === "narration" ? body.kind : undefined;
        if (!kind) return NextResponse.json({ code: 400, data: null, msg: "配音类型必须为 dialogue 或 narration" }, { status: 400 });

        // 与 L 一致：没有文本就不该产生任务，这里先给出明确提示而不是静默返回成功。
        const text = kind === "narration" ? shot.narration : shot.dialogue;
        if (!text?.trim()) return NextResponse.json({ code: 400, data: null, msg: kind === "narration" ? "本镜没有解说旁白文案" : "本镜没有对白文案" }, { status: 400 });

        const runtimeOrigin = resolveInternalOrigin(resolvePublicRequestOrigin(request));
        const result = await runOneClickAudioForEpisodes({
            taskId: `one-click-film-audio:${project.id}:${episodeId}:${shotId}:${kind}`,
            userId: user.id,
            project,
            episodeIds: [episodeId],
            shotIds: [shotId],
            kinds: [kind],
            runtime: { origin: runtimeOrigin, cookie: request.headers.get("cookie") || "" },
        });

        return NextResponse.json({ code: 0, data: { status: result.status, taskIds: result.childTaskIds }, msg: result.status === "success" ? "配音已就绪" : "配音任务已创建" });
    } catch (error) {
        return NextResponse.json({ code: 500, data: null, msg: error instanceof Error ? error.message : "配音任务创建失败" }, { status: 500 });
    }
}
