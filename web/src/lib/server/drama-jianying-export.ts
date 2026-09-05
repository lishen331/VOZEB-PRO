import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

import { AudioMaterial, AudioSegment, ClipSettings, DraftFolder, TextSegment, TextStyle, TrackType, VideoMaterial, VideoSegment, trange } from "jsjianyingdraft";
import { zipSync } from "fflate";

import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { dramaOutputDimensions } from "@/lib/drama-image-size";
import { resolveDramaAudioTracks, type DramaAudioTrackKind } from "@/lib/server/drama-audio-tracks";
import { downloadMediaToFile } from "@/lib/server/media-download";

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

type JianyingExportShot = Pick<DramaShot, "videoUrl" | "audioUrl" | "duration" | "subtitle" | "dialogue" | "narration" | "dialogueAudio" | "narrationAudio" | "audioMode">;
type JianyingAudioInput = Pick<DramaShot, "audioUrl" | "dialogueAudio" | "narrationAudio" | "audioMode">;
type JianyingExportProject = Pick<DramaProject, "title" | "ratio">;
type JianyingExportEpisode = Pick<DramaEpisode, "title"> & { shots: JianyingExportShot[] };

const LEGACY_AUDIO_TRACK = "\u914d\u97f3";
const DIALOGUE_AUDIO_TRACK = "\u5bf9\u767d";
const NARRATION_AUDIO_TRACK = "\u65c1\u767d";

export async function exportDramaEpisodeAsJianying(input: {
    project: JianyingExportProject;
    episode: JianyingExportEpisode;
    draftPath: string;
    version: "5" | "6";
    origin: string;
    cookie?: string;
    /** Dedicated dialogue/narration tracks are owned by the short-drama lab. */
    preferDedicatedAudio?: boolean;
}) {
    const clips = input.episode.shots.filter((shot) => shot.videoUrl);
    if (!clips.length) throw new DramaJianyingExportError("本集还没有可导出的视频", 422);
    const draftPath = normalizeDraftPath(input.draftPath);
    const draftName = buildJianyingDraftName(input.project.title, input.episode.title);
    const root = await mkdtemp(join(tmpdir(), "vozeb-jianying-"));
    try {
        const draftRoot = join(root, "drafts");
        await mkdir(draftRoot, { recursive: true });
        const folder = new DraftFolder(draftRoot);
        const { width, height } = dramaOutputDimensions(input.project.ratio, 1920, 1080);
        const script = folder.createDraft(draftName, width, height, { allowReplace: true });
        const draftDir = join(draftRoot, draftName);
        const assetsDir = join(draftDir, "assets");
        await mkdir(assetsDir, { recursive: true });
        script.addTrack(TrackType.video);
        const clipAudioTracks = clips.map((shot) => resolveJianyingAudioTracks(shot, { preferDedicatedAudio: input.preferDedicatedAudio ?? true }));
        const missingVoiceover = clips.some((shot, index) => shot.audioMode === "voiceover" && !clipAudioTracks[index].length);
        if (missingVoiceover) throw new DramaJianyingExportError("部分镜头选择了 AI 配音，但配音尚未完成", 422);
        if (clipAudioTracks.some((tracks) => tracks.some((track) => track.kind === "dialogue"))) script.addTrack(TrackType.audio, DIALOGUE_AUDIO_TRACK);
        if (clipAudioTracks.some((tracks) => tracks.some((track) => track.kind === "narration"))) script.addTrack(TrackType.audio, NARRATION_AUDIO_TRACK);
        if (clipAudioTracks.some((tracks) => tracks.some((track) => track.kind === "legacy"))) script.addTrack(TrackType.audio, LEGACY_AUDIO_TRACK);
        if (clips.some((shot) => (shot.subtitle || shot.dialogue || shot.narration).trim())) script.addTrack(TrackType.text, "字幕");
        const textStyle = new TextStyle({ size: height > width ? 12 : 8, color: [1, 1, 1], align: 1, bold: true, autoWrapping: true, maxLineWidth: height > width ? 0.82 : 0.62 });
        const textPosition = new ClipSettings({ transformY: height > width ? -0.75 : -0.8 });
        let offset = 0;
        let totalBytes = 0;
        for (const [index, shot] of clips.entries()) {
            const duration = Math.max(1, shot.duration) * 1_000_000;
            const videoPath = join(assetsDir, `segment_${String(index + 1).padStart(3, "0")}.mp4`);
            const downloadedVideo = await downloadMediaToFile(shot.videoUrl!, videoPath, { origin: input.origin, cookie: input.cookie, maxBytes: MAX_MEDIA_BYTES });
            totalBytes += downloadedVideo.bytes;
            if (totalBytes > MAX_MEDIA_BYTES) throw new DramaJianyingExportError("剪映导出素材超过 200MB，请减少镜头后重试", 413);
            // Video files may contain their own production audio.  Once a
            // dedicated TTS track is selected (or the shot is muted), set the
            // segment volume to zero so JianYing cannot play the embedded
            // source audio underneath the exported track.
            const videoVolume = shouldMuteJianyingVideoAudio(shot, clipAudioTracks[index]) ? 0 : 1;
            script.addSegment(new VideoSegment(new VideoMaterial(videoPath, { duration, width, height }), trange(offset, duration), { volume: videoVolume }));
            for (const track of clipAudioTracks[index]) {
                const audioPath = join(assetsDir, `${track.kind}_audio_${String(index + 1).padStart(3, "0")}${audioExtension(track.url)}`);
                const downloadedAudio = await downloadMediaToFile(track.url, audioPath, { origin: input.origin, cookie: input.cookie, maxBytes: 20 * 1024 * 1024 });
                totalBytes += downloadedAudio.bytes;
                if (totalBytes > MAX_MEDIA_BYTES) throw new DramaJianyingExportError("剪映导出素材超过 200MB，请减少镜头后重试", 413);
                script.addSegment(new AudioSegment(new AudioMaterial(audioPath, { duration }), trange(offset, duration)), audioTrackName(track.kind));
            }
            const subtitle = (shot.subtitle || shot.dialogue || shot.narration).trim();
            if (subtitle) script.addSegment(new TextSegment(subtitle, trange(offset, duration), { style: textStyle, clipSettings: textPosition }), "字幕");
            offset += duration;
        }
        script.save();
        const contentPath = join(draftDir, "draft_content.json");
        await replaceDraftPaths(contentPath, assetsDir, `${draftPath.replace(/[\\/]+$/, "")}/${draftName}/assets`);
        if (input.version === "6") await rename(contentPath, join(draftDir, "draft_info.json"));
        const entries = await collectZipEntries(draftDir, draftName);
        return { data: zipSync(entries, { level: 0 }), fileName: `${draftName}_剪映草稿.zip` };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

/** Return the completed audio tracks for one export shot. */
export function resolveJianyingAudioTracks(shot: JianyingAudioInput, options: { preferDedicatedAudio?: boolean } = {}): Array<{ kind: DramaAudioTrackKind; url: string }> {
    if (shot.audioMode === "mute") return [];
    if (options.preferDedicatedAudio === false) {
        // The legacy /drama surface only knows the root audioUrl.  Preserve
        // its historical behaviour for explicit voiceover and old payloads
        // with no mode, while ignoring lab-only dedicated tracks.
        return shot.audioMode !== "source" && shot.audioUrl ? [{ kind: "legacy", url: shot.audioUrl }] : [];
    }
    const resolved = resolveDramaAudioTracks(shot);
    // Match render semantics: explicit source mode keeps the video's own
    // audio unless a dedicated dialogue/narration result exists.  The legacy
    // `audioUrl` projection is not an independent track in source mode.
    if (shot.audioMode === "source" && !resolved.dialogueUrl && !resolved.narrationUrl) return [];
    return resolved.tracks;
}

/** Whether JianYing must silence the source video's embedded audio. */
export function shouldMuteJianyingVideoAudio(shot: JianyingAudioInput, tracks = resolveJianyingAudioTracks(shot)) {
    if (shot.audioMode === "mute" || shot.audioMode === "voiceover") return true;
    if (shot.audioMode === "source") return tracks.some((track) => track.kind === "dialogue" || track.kind === "narration");
    // An omitted mode is an old export payload.  Preserve its legacy external
    // track while preventing the source audio from being doubled.
    return tracks.length > 0;
}

function audioTrackName(kind: DramaAudioTrackKind) {
    if (kind === "dialogue") return DIALOGUE_AUDIO_TRACK;
    if (kind === "narration") return NARRATION_AUDIO_TRACK;
    return LEGACY_AUDIO_TRACK;
}

export function buildJianyingDraftName(projectTitle: string, episodeTitle: string) {
    const title = safeName(projectTitle) || "短剧项目";
    const episode = safeName(episodeTitle) || "第1集";
    return `${title}_${episode}`.slice(0, 100);
}

function normalizeDraftPath(value: string) {
    const path = value.trim();
    if (!path || path.length > 1024 || /[\u0000-\u001f]/.test(path) || (!/^[A-Za-z]:[\\/]/.test(path) && !path.startsWith("/"))) throw new DramaJianyingExportError("请填写有效的剪映草稿绝对路径", 400);
    return path;
}

function safeName(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\.\.+/g, "_")
        .replace(/[. ]+$/g, "");
}

function audioExtension(url: string) {
    try {
        const extension = extname(new URL(url, "http://local").pathname).toLowerCase();
        return [".wav", ".m4a", ".aac", ".ogg"].includes(extension) ? extension : ".mp3";
    } catch {
        return ".mp3";
    }
}

async function replaceDraftPaths(jsonPath: string, from: string, to: string) {
    const data = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
    const replace = (value: unknown): unknown => {
        if (typeof value === "string") return value.includes(from) ? value.replaceAll(from, to) : value;
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
        return value;
    };
    await writeFile(jsonPath, JSON.stringify(replace(data)), "utf8");
}

async function collectZipEntries(directory: string, draftName: string) {
    const entries: Record<string, Uint8Array> = {};
    const walk = async (current: string) => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) await walk(path);
            else entries[`${draftName}/${relative(directory, path).replaceAll("\\", "/")}`] = new Uint8Array(await readFile(path));
        }
    };
    await walk(directory);
    return entries;
}

export class DramaJianyingExportError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
