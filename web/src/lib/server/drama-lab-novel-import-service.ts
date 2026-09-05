import { nanoid } from "nanoid";

import type { DramaEpisode, DramaProject } from "@/lib/drama-project-contract";
import { splitDramaSource, type DramaSourceEpisodeDraft } from "@/lib/drama-source-splitter";
import { createDramaProjectVersionForUser, getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";

/** Keep the import bounded before it is copied into episode scripts. */
export const DRAMA_LAB_NOVEL_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
export const DRAMA_LAB_NOVEL_DEFAULT_TARGET_CHARACTERS = 4_000;

export class DramaLabNovelImportError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "DramaLabNovelImportError";
    }
}

export type DramaLabNovelImportPreview = {
    fileName: string;
    sourceCharacters: number;
    sourceBytes: number;
    drafts: DramaSourceEpisodeDraft[];
};

export type DramaLabNovelImportResult = DramaLabNovelImportPreview & {
    committed: boolean;
    project?: DramaProject;
    versionId?: string;
};

export type DramaLabNovelImportInput = {
    userId: string;
    /** Owner-backed project storage identity for approved collaborators. */
    projectOwnerUserId?: string;
    projectId: string;
    sourceText: string;
    fileName?: string;
    targetCharacters?: number;
    /** A preview is returned unless the caller explicitly confirms the write. */
    commit?: boolean;
};

export function previewDramaLabNovelImport(input: Pick<DramaLabNovelImportInput, "sourceText" | "fileName" | "targetCharacters">): DramaLabNovelImportPreview {
    const sourceText = normalizeSourceText(input.sourceText);
    const sourceBytes = Buffer.byteLength(sourceText, "utf8");
    if (!sourceText) throw new DramaLabNovelImportError("导入文件没有可识别的文本内容", 400);
    if (sourceBytes > DRAMA_LAB_NOVEL_MAX_SOURCE_BYTES) throw new DramaLabNovelImportError("小说文件超过 2MB 限制，请拆分后再导入", 413);

    const fileName = normalizeFileName(input.fileName);
    const drafts = splitDramaSource(sourceText, normalizeTargetCharacters(input.targetCharacters));
    if (!drafts.length || !drafts.some((draft) => draft.script.trim())) throw new DramaLabNovelImportError("导入文件没有可识别的文本内容", 400);
    return { fileName, sourceCharacters: sourceText.length, sourceBytes, drafts };
}

/**
 * Preview and commit share the same parser. This makes a confirmed import
 * deterministic and ensures malformed input never reaches project storage.
 */
export async function importDramaLabNovelForUser(input: DramaLabNovelImportInput): Promise<DramaLabNovelImportResult> {
    const preview = previewDramaLabNovelImport(input);
    if (!input.commit) return { ...preview, committed: false };

    const storageUserId = input.projectOwnerUserId || input.userId;
    const project = await getDramaProjectForUser(storageUserId, input.projectId);
    const episodes = preview.drafts.map(toEpisode);

    // Keep a server-side restore point before replacing the current scripts.
    const version = await createDramaProjectVersionForUser(storageUserId, project.id, { reason: "整本小说导入前", snapshot: project });
    const saved = await updateDramaProjectForUser(storageUserId, project.id, {
        ...project,
        activeEpisodeId: episodes[0]?.id,
        episodes,
        updatedAt: new Date().toISOString(),
    });
    return { ...preview, committed: true, project: saved, versionId: version.id };
}

function toEpisode(draft: DramaSourceEpisodeDraft, index: number): DramaEpisode {
    return {
        id: `episode-${nanoid()}`,
        episodeNumber: index + 1,
        title: draft.title || `第 ${index + 1} 集`,
        script: draft.script,
        outline: "",
        hook: "",
        nextPreview: "",
        sourceRange: draft.sourceRange,
        reviewStatus: "draft",
        shots: [],
    };
}

function normalizeSourceText(value: unknown) {
    return typeof value === "string"
        ? value
              .replace(/^\uFEFF/u, "")
              .replace(/\r\n?/gu, "\n")
              .trim()
        : "";
}

function normalizeFileName(value: unknown) {
    const fileName = typeof value === "string" ? value.replace(/[\r\n\\/]/gu, "_").trim() : "";
    if (!fileName) return "小说.txt";
    if (!/\.(?:txt|md)$/iu.test(fileName)) throw new DramaLabNovelImportError("仅支持 TXT 或 MD 小说文件", 415);
    return fileName.slice(0, 160);
}

function normalizeTargetCharacters(value: unknown) {
    const target = Math.floor(Number(value));
    return Number.isSafeInteger(target) && target > 0 ? target : DRAMA_LAB_NOVEL_DEFAULT_TARGET_CHARACTERS;
}
