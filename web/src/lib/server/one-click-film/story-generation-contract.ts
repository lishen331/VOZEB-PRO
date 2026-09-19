import { randomUUID } from "node:crypto";
import { jsonrepair } from "jsonrepair";
import type { DramaEpisode, DramaProject } from "@/lib/drama-project-contract";
import contract from "./story-l-contract.json";

export type GeneratedStoryEpisode = { episode: number; title: string; content: string };
export class OneClickStoryError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
    }
}
/** Exported from L promptI18n.getStoryExpansionSystemPrompt with a numeric placeholder. */
export function buildOneClickStoryPrompts(premise: string, style: string, type: string, count: number) {
    const episodeCount = Math.max(1, Math.floor(Number(count) || 1));
    const styles: Record<string, string> = { modern: "现代", ancient: "古风", fantasy: "奇幻", daily: "日常" };
    const types: Record<string, string> = { drama: "剧情", comedy: "喜剧", adventure: "冒险" };
    let user = `请根据以下故事梗概，创作 ${episodeCount} 集短片剧本：\n\n${premise}`;
    if (styles[style]) user += `\n\n故事风格：${styles[style]}`;
    if (types[type]) user += `\n剧本类型：${types[type]}`;
    if (episodeCount > 1) user += `\n生成集数：${episodeCount} 集`;
    return { system: contract.system.replaceAll("987654", String(episodeCount)), user, temperature: 0.8, maxTokens: Math.max(2000, episodeCount * 2200) };
}
/** L accepts arrays, array wrappers, a single episode, then plain text. Do not extract just the first object of an array. */
export function parseOneClickStory(raw: string): GeneratedStoryEpisode[] {
    const text = raw.trim();
    if (!text) throw new OneClickStoryError("AI 未能生成剧本");
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonrepair(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
    } catch {
        parsed = null;
    }
    let episodes: unknown[] | undefined;
    if (Array.isArray(parsed)) episodes = parsed;
    else if (parsed && typeof parsed === "object") {
        const record = parsed as Record<string, unknown>;
        episodes = Object.values(record).find(Array.isArray);
        if (!episodes && (record.content || record.episode)) episodes = [record];
    }
    const result = (episodes || []).flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const ep = item as Record<string, unknown>;
        const content = ep.content || ep.script || ep.text || ep.body;
        if (typeof content !== "string" || !content.trim()) return [];
        const number = Number(ep.episode ?? index + 1);
        return [{ episode: number, title: typeof ep.title === "string" && ep.title.trim() ? ep.title.trim() : `第${number}集`, content: content.trim() }];
    });
    return result.length ? result : [{ episode: 1, title: "第1集", content: text }];
}
/** Merge only generated script fields. Existing shots/assets and current active episode remain unchanged. */
export function mergeOneClickStory(project: DramaProject, episodes: GeneratedStoryEpisode[], targetEpisodeId?: string): DramaProject {
    const targetIndex = targetEpisodeId ? project.episodes.findIndex((ep) => ep.id === targetEpisodeId) : -1;
    if (targetEpisodeId && targetIndex < 0) throw new OneClickStoryError("当前剧集已删除", 409);
    const next = [...project.episodes];
    let highest = Math.max(0, ...next.map((ep, index) => ep.episodeNumber || index + 1));
    for (const [index, generated] of episodes.entries()) {
        if (index === 0 && targetIndex >= 0) {
            next[targetIndex] = { ...next[targetIndex], title: generated.title, script: generated.content, scriptRichContent: undefined };
        } else {
            const episode: DramaEpisode = { id: `episode-${randomUUID()}`, episodeNumber: ++highest, title: generated.title, script: generated.content, outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] };
            next.push(episode);
        }
    }
    return { ...project, episodes: next, activeEpisodeId: project.activeEpisodeId || next[0]?.id, updatedAt: new Date().toISOString() };
}
