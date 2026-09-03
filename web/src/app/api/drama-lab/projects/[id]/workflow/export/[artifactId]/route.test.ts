import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getDramaLabWorkflowTask: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    readDramaLabWorkflowExportArtifact: vi.fn(),
    DramaLabWorkflowError: class DramaLabWorkflowError extends Error {
        constructor(
            message: string,
            readonly status = 502,
        ) {
            super(message);
        }
    },
    DramaLabCollaborationError: class DramaLabCollaborationError extends Error {
        constructor(
            message: string,
            readonly status = 403,
        ) {
            super(message);
        }
    },
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/drama-lab-workflow-task-service", () => ({
    getDramaLabWorkflowTask: mocks.getDramaLabWorkflowTask,
    DramaLabWorkflowError: mocks.DramaLabWorkflowError,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    DramaLabCollaborationError: mocks.DramaLabCollaborationError,
}));
vi.mock("@/lib/server/drama-lab-workflow-export-artifact", () => ({
    readDramaLabWorkflowExportArtifact: mocks.readDramaLabWorkflowExportArtifact,
}));

import { GET } from "./route";

const project = { id: "project-one", title: "Demo" };
const task = {
    id: "task-one",
    userId: "owner-one",
    status: "success",
    workflow: {
        projectId: project.id,
        outputRefs: [{ artifactId: "artifact-one" }],
    },
};
const bytes = new Uint8Array([80, 75, 3, 4, 1, 2]);
const artifact = {
    metadata: {
        artifactId: "artifact-one",
        taskId: task.id,
        projectId: project.id,
        ownerUserId: "owner-one",
        fileName: "demo.zip",
        bytes: bytes.byteLength,
        mediaCount: 1,
        omittedMediaCount: 0,
        createdAt: "2026-09-02T00:00:00.000Z",
    },
    data: bytes,
};

describe("Drama Lab workflow export download route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "owner-one" });
        mocks.getDramaLabWorkflowTask.mockResolvedValue(task);
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project, ownerUserId: "owner-one" });
        mocks.readDramaLabWorkflowExportArtifact.mockResolvedValue(artifact);
    });

    it("requires an authenticated session", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), {
            params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }),
        });

        expect(response.status).toBe(401);
        expect(mocks.getDramaLabWorkflowTask).not.toHaveBeenCalled();
        expect(mocks.readDramaLabWorkflowExportArtifact).not.toHaveBeenCalled();
    });

    it("rejects a non-project member before reading the artifact", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "outsider" });
        // The workflow service is the first membership gate. A null task is
        // the same result an outsider receives for a task they cannot address.
        mocks.getDramaLabWorkflowTask.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), {
            params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }),
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 404 });
        expect(mocks.readDramaLabWorkflowExportArtifact).not.toHaveBeenCalled();
    });

    it("applies the collaboration gate even when a task lookup succeeds", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "outsider" });
        mocks.resolveDramaLabProjectForRequest.mockRejectedValue(new mocks.DramaLabCollaborationError("not a project member"));

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), {
            params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }),
        });

        expect(response.status).toBe(403);
        expect(mocks.readDramaLabWorkflowExportArtifact).not.toHaveBeenCalled();
    });

    it("returns the ZIP bytes with a private download disposition", async () => {
        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), {
            params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/zip");
        expect(response.headers.get("content-disposition")).toContain("demo.zip");
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
        expect(mocks.readDramaLabWorkflowExportArtifact).toHaveBeenCalledWith("artifact-one");
    });

    it("does not serve an artifact whose metadata belongs to another task", async () => {
        mocks.readDramaLabWorkflowExportArtifact.mockResolvedValue({
            ...artifact,
            metadata: { ...artifact.metadata, taskId: "foreign-task" },
        });

        const response = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), {
            params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }),
        });

        expect(response.status).toBe(404);
    });

    it("supports repeated reads of the same durable artifact", async () => {
        const context = { params: Promise.resolve({ id: project.id, artifactId: "artifact-one" }) };
        const first = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), context);
        const second = await GET(new Request("http://localhost/api/drama-lab/projects/project-one/workflow/export/artifact-one"), context);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(mocks.readDramaLabWorkflowExportArtifact).toHaveBeenCalledTimes(2);
        expect(new Uint8Array(await second.arrayBuffer())).toEqual(bytes);
    });
});
