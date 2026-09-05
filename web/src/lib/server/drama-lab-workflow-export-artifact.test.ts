import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const state = vi.hoisted(() => ({ root: "" }));

vi.mock("@/lib/server/data-dir", () => ({
    resolveServerDataPath: (name: string) => join(state.root, name),
}));

let dataRoot = "";
let writeDramaLabWorkflowExportArtifact: (typeof import("./drama-lab-workflow-export-artifact"))["writeDramaLabWorkflowExportArtifact"];
let readDramaLabWorkflowExportArtifact: (typeof import("./drama-lab-workflow-export-artifact"))["readDramaLabWorkflowExportArtifact"];

describe("drama lab workflow export artifact store", () => {
    beforeAll(async () => {
        dataRoot = await mkdtemp(join(tmpdir(), "vozeb-workflow-export-"));
        state.root = dataRoot;
        ({ writeDramaLabWorkflowExportArtifact, readDramaLabWorkflowExportArtifact } = await import("./drama-lab-workflow-export-artifact"));
    });

    afterAll(async () => {
        await rm(dataRoot, { recursive: true, force: true });
    });

    it("writes metadata and ZIP bytes, then reads them repeatedly", async () => {
        const data = new Uint8Array([80, 75, 3, 4, 9, 8, 7]);
        const input = {
            taskId: "workflow-artifact-test",
            projectId: "project-one",
            ownerUserId: "owner-one",
            fileName: "../script-export.zip",
            data,
            mediaCount: 3,
            omittedMediaCount: 1,
        };

        const metadata = await writeDramaLabWorkflowExportArtifact(input);
        expect(metadata).toMatchObject({
            artifactId: input.taskId,
            taskId: input.taskId,
            projectId: input.projectId,
            ownerUserId: input.ownerUserId,
            bytes: data.byteLength,
            mediaCount: 3,
            omittedMediaCount: 1,
        });
        expect(metadata.fileName).not.toContain("..");

        const first = await readDramaLabWorkflowExportArtifact(metadata.artifactId);
        const second = await readDramaLabWorkflowExportArtifact(metadata.artifactId);
        expect(first?.metadata).toMatchObject(metadata);
        expect(first?.data).toEqual(data);
        expect(second?.data).toEqual(data);

        const metadataFile = await readFile(join(dataRoot, "drama-lab-workflow-exports", `${metadata.artifactId}.json`), "utf8");
        expect(JSON.parse(metadataFile)).toMatchObject({ artifactId: metadata.artifactId, bytes: data.byteLength });
    });

    it("rejects traversal-like artifact ids", async () => {
        await expect(readDramaLabWorkflowExportArtifact("../workflow-artifact-test")).resolves.toBeNull();
        await expect(readDramaLabWorkflowExportArtifact("bad")).resolves.toBeNull();
    });
});
