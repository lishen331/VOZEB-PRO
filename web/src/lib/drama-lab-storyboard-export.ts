import ExcelJS from "exceljs";

export type StoryboardShot = {
    id: string;
    episodeId?: string;
    shotNumber?: number;
    storyboardNumber?: number;
    segmentIndex?: number;
    segmentTitle?: string;
    sceneId?: string;
    characterIds?: string[];
    propIds?: string[];
    duration?: number;
    title?: string;
    description?: string;
    sourceText?: string;
    dialogue?: string;
    narration?: string;
    location?: string;
    time?: string;
    action?: string;
    result?: string;
    atmosphere?: string;
    layoutDescription?: string;
    shotType?: string;
    movement?: string;
    imagePrompt?: string;
    polishedPrompt?: string;
    videoPrompt?: string;
    universalSegmentText?: string;
    frames?: { first?: { prompt?: string }; last?: { prompt?: string } };
    script?: string;
    cameraMotion?: string;
};
export type StoryboardAsset = { id: string; name?: string; location?: string; time?: string; description?: string; appearance?: string; personality?: string; type?: string; prompt?: string; polishedPrompt?: string };
export type StoryboardExportInput = { projectTitle?: string; episode: { id: string; number?: number }; shots: StoryboardShot[]; scenes?: StoryboardAsset[]; characters?: StoryboardAsset[]; props?: StoryboardAsset[] };

const COLUMNS = [
    "镜头序号",
    "镜号",
    "镜头标题",
    "段幕",
    "时长(秒)",
    "景别",
    "运镜",
    "场景",
    "角色",
    "道具",
    "地点",
    "时间",
    "镜头描述",
    "对白",
    "解说旁白",
    "动作",
    "结果",
    "氛围",
    "布局描述",
    "首帧提示词",
    "尾帧提示词",
    "图片提示词",
    "视频提示词",
    "全能片段",
];
const text = (value: unknown) => (value == null ? "" : String(value).replace(/\r\n/g, "\n").trim());
const assetBlock = (asset: StoryboardAsset | undefined, kind: "scene" | "character" | "prop") => {
    if (!asset) return "";
    const head = text(kind === "scene" ? asset.location : asset.name) || "未命名";
    const parts =
        kind === "scene"
            ? [asset.time && `时间：${asset.time}`, asset.prompt && `提示词：${asset.prompt}`, asset.description && `描述：${asset.description}`]
            : kind === "character"
              ? [asset.appearance && `外貌：${asset.appearance}`, asset.personality && `性格：${asset.personality}`, asset.description && `描述：${asset.description}`]
              : [asset.type && `类型：${asset.type}`, asset.description && `描述：${asset.description}`, asset.prompt && `提示词：${asset.prompt}`];
    return [head, ...parts.filter(Boolean).map(text)].join("\n");
};
const joinAssets = (ids: string[] | undefined, assets: StoryboardAsset[] | undefined, kind: "character" | "prop") =>
    (ids ?? [])
        .map((id) =>
            assetBlock(
                (assets ?? []).find((a) => a.id === id),
                kind,
            ),
        )
        .filter(Boolean)
        .join("\n\n");
function currentShots(input: StoryboardExportInput) {
    const shots = input.shots.filter((s) => !s.episodeId || s.episodeId === input.episode.id).sort((a, b) => (a.shotNumber ?? 0) - (b.shotNumber ?? 0));
    if (!shots.length) throw new Error("当前集暂无分镜");
    return shots;
}
function duration(shot: StoryboardShot) {
    const n = Number(shot.duration);
    return Number.isFinite(n) && n > 0 ? n : 5;
}
export function buildStoryboardNarrationSrt(input: StoryboardExportInput) {
    let t = 0,
        index = 1;
    const lines: string[] = [];
    for (const shot of currentShots(input)) {
        const d = Math.round(duration(shot) * 1000);
        const narration = text(shot.narration).replace(/\n{2,}/g, "\n");
        if (narration) {
            lines.push(String(index++), `${timestamp(t)} --> ${timestamp(t + d)}`, narration, "");
        }
        t += d;
    }
    if (!lines.length) throw new Error("当前分镜没有可导出的解说文案");
    return lines.join("\n");
}
function timestamp(ms: number) {
    const h = Math.floor(ms / 3600000),
        m = Math.floor(ms / 60000) % 60,
        s = Math.floor(ms / 1000) % 60,
        z = ms % 1000;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(z).padStart(3, "0")}`;
}
export async function buildStoryboardXlsx(input: StoryboardExportInput): Promise<Uint8Array<ArrayBuffer>> {
    const shots = currentShots(input);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("分镜表");
    sheet.addRow(COLUMNS);
    const rows = shots.map((s, i) => [
        i + 1,
        s.storyboardNumber ?? s.shotNumber ?? i + 1,
        text(s.title) || `镜头${i + 1}`,
        s.segmentTitle ? `第${(s.segmentIndex ?? 0) + 1}幕·${s.segmentTitle}` : s.segmentIndex == null ? "" : `第${s.segmentIndex + 1}幕`,
        duration(s),
        text(s.shotType),
        text(s.cameraMotion || s.movement),
        assetBlock(
            input.scenes?.find((a) => a.id === s.sceneId),
            "scene",
        ),
        joinAssets(s.characterIds, input.characters, "character"),
        joinAssets(s.propIds, input.props, "prop"),
        text(s.location),
        text(s.time),
        text(s.description || s.sourceText),
        text(s.dialogue),
        text(s.narration),
        text(s.action),
        text(s.result),
        text(s.atmosphere),
        text(s.layoutDescription),
        text(s.frames?.first?.prompt),
        text(s.frames?.last?.prompt),
        text(s.polishedPrompt || s.imagePrompt),
        text(s.videoPrompt),
        text(s.universalSegmentText),
    ]);
    rows.forEach((row) => sheet.addRow(row));
    sheet.columns.forEach((column, i) => {
        column.width = i < 5 ? 14 : 24;
    });
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    sheet.eachRow((row) => {
        row.alignment = { vertical: "top", wrapText: true };
    });
    return new Uint8Array(await workbook.xlsx.writeBuffer());
}
export function storyboardExportFilename(input: StoryboardExportInput, extension: "xlsx" | "srt") {
    const title = text(input.projectTitle || "project").replace(/[\\/:*?"<>|]/g, "_");
    const episode = input.episode.number == null ? `ep${input.episode.id}` : `第${input.episode.number}集`;
    return `${title}-${episode}-${extension === "xlsx" ? "分镜表" : "解说"}.${extension}`;
}
