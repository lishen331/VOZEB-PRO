import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { resolveServerDataPath } from "@/lib/server/data-dir";

const ARTIFACT_ROOT = resolveServerDataPath("drama-lab-workflow-exports");
const MAX_ARTIFACT_BYTES = 320 * 1024 * 1024;

export type DramaLabWorkflowExportArtifact = {
    artifactId: string;
    taskId: string;
    projectId: string;
    ownerUserId: string;
    fileName: string;
    bytes: number;
    mediaCount: number;
    omittedMediaCount: number;
    createdAt: string;
};

/** Persist a workflow export outside the task JSON while retaining a stable
 * task-scoped reference. The task itself remains the authorization source. */
export async function writeDramaLabWorkflowExportArtifact(input: {
    taskId: string;
    projectId: string;
    ownerUserId: string;
    fileName: string;
    data: Uint8Array;
    mediaCount?: number;
    omittedMediaCount?: number;
}) {
    const taskId = cleanId(input.taskId);
    const projectId = cleanId(input.projectId);
    const ownerUserId = cleanId(input.ownerUserId);
    if (!taskId || !projectId || !ownerUserId) throw new Error("导出产物缺少任务或项目归属");
    if (input.data.byteLength <= 0 || input.data.byteLength > MAX_ARTIFACT_BYTES) throw new Error("导出产物超过大小限制");
    const fileName = safeFileName(input.fileName) || "短剧项目-短剧实验室.zip";
    const artifactId = taskId;
    const path = artifactPath(artifactId);
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
        await writeFile(temporary, input.data);
        await rename(temporary, path);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
    const metadata: DramaLabWorkflowExportArtifact = {
        artifactId,
        taskId,
        projectId,
        ownerUserId,
        fileName,
        bytes: input.data.byteLength,
        mediaCount: nonNegative(input.mediaCount),
        omittedMediaCount: nonNegative(input.omittedMediaCount),
        createdAt: new Date().toISOString(),
    };
    await writeFile(metadataPath(artifactId), `${JSON.stringify(metadata)}\n`, "utf8");
    return metadata;
}

export async function readDramaLabWorkflowExportArtifact(artifactId: string) {
    const id = cleanId(artifactId);
    if (!id || id !== artifactId || !/^[A-Za-z0-9_-]{8,200}$/.test(id)) return null;
    try {
        const metadata = JSON.parse(await readFile(metadataPath(id), "utf8")) as DramaLabWorkflowExportArtifact;
        const file = await stat(artifactPath(id));
        if (!metadata || metadata.artifactId !== id || file.size <= 0 || file.size > MAX_ARTIFACT_BYTES) return null;
        return { metadata: { ...metadata, bytes: file.size }, data: new Uint8Array(await readFile(artifactPath(id))) };
    } catch {
        return null;
    }
}

function artifactPath(id: string) {
    return resolve(ARTIFACT_ROOT, `${id}.zip`);
}

function metadataPath(id: string) {
    return resolve(ARTIFACT_ROOT, `${id}.json`);
}

function cleanId(value: unknown) {
    return typeof value === "string" && value.trim().length <= 200 ? value.trim() : "";
}

function nonNegative(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function safeFileName(value: unknown) {
    return typeof value === "string" ? value.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "_").replace(/\.{2,}/g, "_").replace(/[. ]+$/g, "").slice(0, 180) : "";
}
