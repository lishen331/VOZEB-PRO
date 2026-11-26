import Papa from "papaparse";

import { CSV_ENCODING_ERROR, decodeCsvBytes } from "@/lib/csv-encoding";
import { WORK_CATEGORIES, type WorkCategory } from "@/lib/work-publication-options";

const COLUMNS = ["title", "description", "publicPrompt", "category", "tags", "authorName", "authorDisplay", "coverFile", "mediaFiles"] as const;
export type OfficialWorkImportRow = {
    row: number;
    title: string;
    description: string;
    publicPrompt: string;
    category: WorkCategory;
    tags: string[];
    authorName: string;
    authorDisplay: "custom" | "hidden";
    coverFile: string;
    mediaFiles: string[];
};
export type OfficialWorkImportResult = { ok: true; rows: OfficialWorkImportRow[] } | { ok: false; row?: number; message: string };
type NamedMedia = { name: string; type: string };
export type OfficialWorkMatchedRow<T> = OfficialWorkImportRow & { coverFileObject: T; mediaFileObjects: T[] };

export function parseOfficialWorkImportCsv(source: string): OfficialWorkImportResult {
    const parsed = Papa.parse<Record<(typeof COLUMNS)[number], string> & { __parsed_extra?: string[] }>(source, { header: true, skipEmptyLines: true });
    const fields = parsed.meta.fields || [];
    if (fields.length !== COLUMNS.length || COLUMNS.some((column, index) => fields[index] !== column)) return { ok: false, row: 1, message: `CSV 列必须依次为 ${COLUMNS.join(", ")}` };
    if (parsed.errors.length || parsed.data.some((item) => item.__parsed_extra?.length)) return { ok: false, message: "CSV 存在格式错误或额外列" };
    const seen = new Set<string>();
    const rows: OfficialWorkImportRow[] = [];
    for (const [index, item] of parsed.data.entries()) {
        const title = item.title.trim();
        const coverFile = item.coverFile.trim();
        const mediaFiles = [
            ...new Set(
                item.mediaFiles
                    .split("|")
                    .map((file) => file.trim())
                    .filter(Boolean),
            ),
        ];
        if (!title || !coverFile || !mediaFiles.length) return { ok: false, row: index + 2, message: "作品标题、封面文件和媒体文件必填" };
        const category = item.category.trim() || "其他";
        const authorDisplay = item.authorDisplay.trim() || "custom";
        if (!WORK_CATEGORIES.some((value) => value === category)) return { ok: false, row: index + 2, message: "作品分类无效" };
        if (authorDisplay !== "custom" && authorDisplay !== "hidden") return { ok: false, row: index + 2, message: "作者展示方式应填写 custom 或 hidden" };
        const signature = JSON.stringify([title, category, coverFile, mediaFiles.slice().sort()]);
        if (seen.has(signature)) return { ok: false, row: index + 2, message: "导入清单中存在重复作品" };
        seen.add(signature);
        rows.push({
            row: index + 2,
            title,
            description: item.description.trim(),
            publicPrompt: item.publicPrompt.trim(),
            category: category as WorkCategory,
            tags: item.tags
                .split(/[|;；]/)
                .map((tag) => tag.trim())
                .filter(Boolean),
            authorName: item.authorName.trim() || "平台官方",
            authorDisplay,
            coverFile,
            mediaFiles,
        });
    }
    return rows.length ? { ok: true, rows } : { ok: false, message: "CSV 中没有待导入作品" };
}

export function parseOfficialWorkImportCsvBytes(buffer: ArrayBuffer): OfficialWorkImportResult {
    const text = decodeCsvBytes(buffer);
    return text === null ? { ok: false, message: CSV_ENCODING_ERROR } : parseOfficialWorkImportCsv(text);
}

export function matchOfficialWorkImportFiles<T extends NamedMedia>(rows: readonly OfficialWorkImportRow[], files: readonly T[]): { ok: true; rows: OfficialWorkMatchedRow<T>[] } | { ok: false; row?: number; message: string } {
    const byName = new Map<string, T>();
    for (const file of files) {
        const name = file.name.split(/[\\/]/).pop() || file.name;
        if (byName.has(name)) return { ok: false, message: `媒体文件名“${name}”重名，无法唯一匹配` };
        byName.set(name, file);
    }
    const matched: OfficialWorkMatchedRow<T>[] = [];
    for (const row of rows) {
        const names = new Set([row.coverFile, ...row.mediaFiles]);
        for (const name of names) {
            if (!byName.has(name)) return { ok: false, row: row.row, message: `第 ${row.row} 行找不到媒体文件“${name}”` };
        }
        const mediaFileObjects = row.mediaFiles.map((name) => byName.get(name)!);
        if (mediaFileObjects.some((file) => !((file.type.startsWith("image/") && file.type !== "image/svg+xml") || file.type.startsWith("video/")))) return { ok: false, row: row.row, message: "作品广场仅支持图片或视频文件，不支持音频" };
        const coverFileObject = byName.get(row.coverFile)!;
        if (!coverFileObject.type.startsWith("image/") || coverFileObject.type === "image/svg+xml") return { ok: false, row: row.row, message: `第 ${row.row} 行的封面“${row.coverFile}”必须是图片` };
        matched.push({ ...row, coverFileObject, mediaFileObjects });
    }
    return { ok: true, rows: matched };
}

export const OFFICIAL_WORK_IMPORT_CSV_TEMPLATE = `\uFEFF${Papa.unparse([
    [...COLUMNS],
    ["春日海报", "春日主题视觉作品", "", "插画", "国风|海报", "平台官方", "custom", "春日封面.png", "春日封面.png|春日细节.png"],
    ["校园短片", "校园生活短片", "", "视频", "校园|短片", "平台官方", "custom", "校园封面.png", "校园封面.png|校园短片.mp4"],
])}`;
