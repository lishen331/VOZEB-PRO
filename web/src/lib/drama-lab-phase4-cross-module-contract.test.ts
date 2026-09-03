import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/lib/canvas-project-contract";
import { dramaLabEpisodeCanvasHandoffId, isDramaLabCanvasProject, parseDramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import type { DramaProject } from "@/lib/drama-project-contract";
import { readVerifiedSystemAiBusinessRequest, systemAiBillingHeaders } from "@/lib/server/system-ai-billing";

import { mergeEpisodeProjection, projectEpisodeToCanvas } from "@/lib/server/drama-lab-episode-canvas-service";

/**
 * Cross-module contract checks intentionally stay at the pure boundary layer.
 * They protect the identity tuple shared by the Drama Lab projection, the
 * ordinary Canvas namespace, and platform billing/task adapters without
 * coupling the test to a provider or a running worker.
 */
describe("Drama Lab Phase 4 cross-module contracts", () => {
    it("keeps episode Canvas identities disjoint from ordinary Canvas and from each other", () => {
        const project = projectFixture();
        const first = projectEpisodeToCanvas(project, project.episodes[0]);
        const second = projectEpisodeToCanvas(project, project.episodes[1]);
        const firstIds = new Set(first.nodes.map((node) => node.id));
        const secondIds = new Set(second.nodes.map((node) => node.id));

        expect([...firstIds].some((id) => secondIds.has(id))).toBe(false);

        const handoff = dramaLabEpisodeCanvasHandoffId(project.id, project.episodes[0].id);
        expect(isDramaLabCanvasProject({ sourceHandoffId: handoff })).toBe(true);
        expect(isDramaLabCanvasProject({ sourceHandoffId: "ordinary-canvas-source" })).toBe(false);
        expect(parseDramaLabEpisodeCanvasHandoffId(handoff)).toEqual({ projectId: project.id, episodeId: project.episodes[0].id });
    });

    it("projects only real project assets and preserves the complete project/episode tuple", () => {
        const project = projectFixture();
        const episode = project.episodes[0];
        const projection = projectEpisodeToCanvas(project, episode);
        const shot = projection.nodes.find((node) => node.id.endsWith(":shot:shot-one"));

        expect(shot?.metadata).toMatchObject({
            projectionOwned: true,
            dramaProjectId: project.id,
            episodeId: episode.id,
            shotId: "shot-one",
            sceneId: "scene-one",
            characterIds: ["character-one"],
            propIds: ["prop-one"],
        });
        expect(JSON.stringify(shot?.metadata)).not.toContain("ghost");

        const scopedNodes = projection.nodes.filter((node) => dramaMetadata(node).projectionOwned === true);
        expect(scopedNodes).not.toHaveLength(0);
        expect(scopedNodes.every((node) => dramaMetadata(node).dramaProjectId === project.id && dramaMetadata(node).episodeId === episode.id)).toBe(true);
        expect(projection.connections.some((edge) => edge.fromNodeId.includes("ghost") || edge.toNodeId.includes("ghost"))).toBe(false);
    });

    it("refreshes only stale Drama projection nodes while retaining user Canvas state", () => {
        const project = projectFixture();
        const episode = project.episodes[0];
        const projection = projectEpisodeToCanvas(project, episode);
        const prefix = `dl:${project.id}:episode:${episode.id}`;
        const staleNode = textNode(`${prefix}:shot:stale`, { projectionOwned: true, dramaProjectId: project.id, episodeId: episode.id, sourceEntityType: "shot", sourceEntityId: "stale" });
        const freeNode = textNode("user-note", { content: "用户编辑" });
        const foreignEpisodeNode = textNode("dl:other-project:episode:other-episode:shot:foreign", {
            projectionOwned: true,
            dramaProjectId: "other-project",
            episodeId: "other-episode",
            sourceEntityType: "shot",
            sourceEntityId: "foreign",
        });
        const current: CanvasProject = {
            id: "canvas-episode-one",
            sourceHandoffId: dramaLabEpisodeCanvasHandoffId(project.id, episode.id),
            title: "旧标题",
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
            nodes: [...projection.nodes, staleNode, freeNode, foreignEpisodeNode],
            connections: [...projection.connections, { id: `${prefix}:edge:stale`, fromNodeId: staleNode.id, toNodeId: `${prefix}:script` }, { id: "user-edge", fromNodeId: "user-note", toNodeId: `${prefix}:script` }],
            chatSessions: [],
            activeChatId: null,
            backgroundMode: "lines",
            showImageInfo: false,
            viewport: { x: 22, y: 33, k: 0.8 },
        };

        const merged = mergeEpisodeProjection(current, projection, {
            prefix,
            title: "我的短剧 · 第一集",
            requestedViewport: { x: 0, y: 0, k: 0.72 },
            locateShot: false,
        });

        expect(merged.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["user-note", foreignEpisodeNode.id]));
        expect(merged.nodes.some((node) => node.id === staleNode.id)).toBe(false);
        expect(merged.connections).toContainEqual({ id: "user-edge", fromNodeId: "user-note", toNodeId: `${prefix}:script` });
        expect(merged.connections.some((edge) => edge.id === `${prefix}:edge:stale`)).toBe(false);
        expect(merged.viewport).toEqual(current.viewport);
        expect(merged.sourceHandoffId).toBe(current.sourceHandoffId);
    });

    it("binds commercial billing and personal-point settlement to the signed project context", () => {
        const billingContext = {
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            projectType: "drama" as const,
            projectId: "drama-one",
        };
        const headers = new Headers(systemAiBillingHeaders("writer", "drama-request-one", "vendor-text", "production", billingContext));

        expect(readVerifiedSystemAiBusinessRequest(headers, "writer", "vendor-text")).toEqual({ businessRequestId: "drama-request-one", billingContext });

        // A client cannot redirect the charge to another project/school by
        // editing the serialized context after the server signed the request.
        headers.set("x-vozeb-pro-billing-context", JSON.stringify({ ...billingContext, projectId: "drama-two" }));
        expect(readVerifiedSystemAiBusinessRequest(headers, "writer", "vendor-text")).toBeUndefined();

        const practiceHeaders = new Headers(systemAiBillingHeaders("writer", "practice-request", "vendor-text", "open-source-practice"));
        expect(readVerifiedSystemAiBusinessRequest(practiceHeaders, "writer", "vendor-text", "production")).toBeUndefined();
        expect(practiceHeaders.has("x-vozeb-pro-billing-context")).toBe(false);
    });
});

function textNode(id: string, metadata: Record<string, unknown>): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Text,
        title: id,
        position: { x: 0, y: 0 },
        width: 300,
        height: 200,
        metadata,
    };
}

function dramaMetadata(node: CanvasNodeData) {
    return (node.metadata || {}) as Record<string, unknown> & { projectionOwned?: boolean; dramaProjectId?: string; episodeId?: string };
}

function projectFixture(): DramaProject {
    const shot = {
        id: "shot-one",
        order: 1,
        title: "咖啡店",
        description: "小雨走进咖啡店",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 4,
        characterIds: ["character-one", "character-ghost"],
        propIds: ["prop-one", "prop-ghost"],
        clueIds: [],
        sceneId: "scene-one",
    };
    return {
        id: "drama-one",
        title: "我的短剧",
        summary: "梗概",
        style: "电影感",
        ratio: "9:16",
        status: "active",
        characters: [{ id: "character-one", name: "小雨", description: "主角", references: [] }],
        scenes: [{ id: "scene-one", name: "咖啡店", description: "室内", references: [] }],
        props: [{ id: "prop-one", name: "手机", description: "黑色手机", references: [] }],
        clues: [],
        defaultVideoMode: "storyboard",
        episodes: [
            { id: "episode-one", episodeNumber: 1, title: "第一集", script: "剧本一", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [shot] },
            { id: "episode-two", episodeNumber: 2, title: "第二集", script: "剧本二", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [{ ...shot, id: "shot-two", order: 1 }] },
        ],
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
    };
}
