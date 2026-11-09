import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { fitNodeAspectRatio, resizeImageNodeToNaturalRatio } from "./canvas-node-size";

const imageNode: CanvasNodeData = {
    id: "image",
    type: CanvasNodeType.Image,
    title: "图片",
    position: { x: 100, y: 200 },
    width: 340,
    height: 240,
    metadata: { content: "/image.png" },
};

describe("Canvas image node sizing", () => {
    it("keeps geometry utilities callable by server-side result recovery", async () => {
        const source = await readFile(new URL("./canvas-node-size.ts", import.meta.url), "utf8");
        expect(source).not.toMatch(/^\s*["']use client["']/);
    });
    it("fits a square image to a square frame without side gutters", () => {
        expect(fitNodeAspectRatio(1024, 1024, 340, 340)).toEqual({ width: 340, height: 340 });
    });

    it("keeps the node center while correcting a saved frame ratio", () => {
        const resized = resizeImageNodeToNaturalRatio(imageNode, 1024, 1024);

        expect(resized).toMatchObject({ width: 340, height: 340, position: { x: 100, y: 150 }, metadata: { naturalWidth: 1024, naturalHeight: 1024 } });
    });

    it("preserves an intentional free-resize frame", () => {
        const resized = resizeImageNodeToNaturalRatio({ ...imageNode, metadata: { ...imageNode.metadata, freeResize: true } }, 1024, 1024);

        expect(resized).toMatchObject({ width: 340, height: 240, position: { x: 100, y: 200 } });
    });

    it("returns the original node after dimensions and ratio are already synchronized", () => {
        const squareNode = { ...imageNode, width: 340, height: 340, metadata: { ...imageNode.metadata, naturalWidth: 1024, naturalHeight: 1024 } };

        expect(resizeImageNodeToNaturalRatio(squareNode, 1024, 1024)).toBe(squareNode);
    });

    it.each(["16:9", "1824x1024"])("keeps requested %s frame when the upstream image has another ratio", (size) => {
        const node = { ...imageNode, width: 320, height: 180, metadata: { ...imageNode.metadata, model: "image-model", size } };
        const resized = resizeImageNodeToNaturalRatio(node, 2172, 724);
        expect(resized).toMatchObject({ width: 320, height: 180, position: node.position, metadata: { naturalWidth: 2172, naturalHeight: 724 } });
        expect(resizeImageNodeToNaturalRatio(resized, 2172, 724)).toBe(resized);
    });

    it("keeps original geometry for auto, uploads and independent layers", () => {
        for (const metadata of [{ size: "16:9" }, { model: "image-model", size: "auto" }, { model: "image-model", size: "16:9", imageOutputMode: "layers" as const }]) {
            const resized = resizeImageNodeToNaturalRatio({ ...imageNode, metadata }, 2172, 724);
            expect(resized.width / resized.height).toBeCloseTo(3);
        }
    });
});
