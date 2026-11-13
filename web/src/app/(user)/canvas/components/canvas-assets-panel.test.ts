import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canvasThemes } from "@/lib/canvas-theme";
import type { Asset } from "@/lib/library-asset-contract";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { libraryAssetToInsertPayload } from "./canvas-asset-insert";
import { canvasProjectMenuItemStyle, collectCanvasPanelMedia, mapPublicWorkAssetsToCanvasItems, publicCanvasAssetToInsertPayload } from "./canvas-assets-panel";

describe("Canvas assets panel", () => {
    it("keeps only displayable image and video nodes in canvas order", () => {
        const nodes: CanvasNodeData[] = [
            node("image", CanvasNodeType.Image, "/api/reference-assets/image.webp"),
            node("text", CanvasNodeType.Text, "说明文字"),
            node("video", CanvasNodeType.Video, "/api/reference-assets/video.mp4"),
            node("empty", CanvasNodeType.Panorama),
        ];

        expect(collectCanvasPanelMedia(nodes)).toEqual([
            { id: "image", title: "image", kind: "image", url: "/api/reference-assets/image.webp" },
            { id: "video", title: "video", kind: "video", url: "/api/reference-assets/video.mp4" },
        ]);
    });

    it("maps each library asset kind to the stable canvas insertion contract", () => {
        expect(libraryAssetToInsertPayload(asset("text"))).toEqual({ kind: "text", title: "text", content: "提示词" });
        expect(libraryAssetToInsertPayload(asset("image"))).toMatchObject({ kind: "image", title: "image", dataUrl: "/image.webp", storageKey: "image-key" });
        expect(libraryAssetToInsertPayload(asset("video"))).toMatchObject({ kind: "video", title: "video", url: "/video.mp4", width: 1280, height: 720 });
        expect(libraryAssetToInsertPayload(asset("audio"))).toMatchObject({ kind: "audio", title: "audio", url: "/audio.mp3", durationMs: 3000 });
    });

    it("maps only published public content media into insertable canvas assets", () => {
        const assets = mapPublicWorkAssetsToCanvasItems({
            slug: "public-story",
            title: "公开作品",
            category: "短片",
            assets: [
                { id: "cover", role: "cover", mediaType: "image", mimeType: "image/png", url: "/cover.png", sortOrder: 0, metadata: {} },
                { id: "image", role: "content", mediaType: "image", mimeType: "image/webp", url: "/public-image.webp", sortOrder: 1, metadata: {} },
                { id: "video", role: "content", mediaType: "video", mimeType: "video/mp4", url: "/public-video.mp4", sortOrder: 2, metadata: {} },
                { id: "audio", role: "content", mediaType: "audio", mimeType: "audio/mpeg", url: "/public-audio.mp3", sortOrder: 3, metadata: {} },
            ],
        });

        expect(assets.map(({ id, kind }) => ({ id, kind }))).toEqual([
            { id: "public-story:image", kind: "image" },
            { id: "public-story:video", kind: "video" },
            { id: "public-story:audio", kind: "audio" },
        ]);
        expect(publicCanvasAssetToInsertPayload(assets[0])).toEqual({ kind: "image", title: "公开作品", dataUrl: "/public-image.webp", remoteUrl: "/public-image.webp", externalReference: true });
        expect(publicCanvasAssetToInsertPayload(assets[1])).toEqual({ kind: "video", title: "公开作品", url: "/public-video.mp4", remoteUrl: "/public-video.mp4" });
        expect(publicCanvasAssetToInsertPayload(assets[2])).toEqual({ kind: "audio", title: "公开作品", url: "/public-audio.mp3", remoteUrl: "/public-audio.mp3" });
    });
    it("keeps canvas dropdown items transparent until pointer or keyboard focus moves onto them", () => {
        expect(canvasProjectMenuItemStyle(canvasThemes.light)).toEqual({ background: "transparent", color: canvasThemes.light.node.text });
        expect(canvasProjectMenuItemStyle(canvasThemes.dark)).toEqual({ background: "transparent", color: canvasThemes.dark.node.text });
    });

    it("keeps stable IP references behind the dormant entry flag", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/canvas/components/canvas-assets-panel.tsx"), "utf8");

        expect(source).toContain('type PanelTab = "current" | "assets" | "prompts" | "ip"');
        expect(source).toContain('IP_REFERENCE_ENTRY_VISIBLE ? <PanelTabButton label="IP"');
        expect(source).toContain('IP_REFERENCE_ENTRY_VISIBLE && activeTab === "ip"');
        expect(source).toContain("<IpReferencePicker");
        expect(source).toContain("ipReferences");
    });
});

function node(id: string, type: CanvasNodeType, content?: string): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata: content ? { content } : undefined };
}

function asset(kind: Asset["kind"]): Asset {
    const base = { id: kind, kind, title: kind, coverUrl: "", tags: [], createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z" };
    if (kind === "text") return { ...base, kind, data: { content: "提示词" } };
    if (kind === "image") return { ...base, kind, data: { dataUrl: "/image.webp", storageKey: "image-key", width: 1280, height: 720, bytes: 1, mimeType: "image/webp" } };
    if (kind === "video") return { ...base, kind, data: { url: "/video.mp4", storageKey: "video-key", width: 1280, height: 720, bytes: 1, mimeType: "video/mp4" } };
    return { ...base, kind, data: { url: "/audio.mp3", storageKey: "audio-key", durationMs: 3000, bytes: 1, mimeType: "audio/mpeg" } };
}
