import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { canvasThemes } from "@/lib/canvas-theme";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { NodeContent, canvasImagePreviewWidth } from "./canvas-node-content";

const imageNode: CanvasNodeData = {
    id: "generated-image",
    type: CanvasNodeType.Image,
    title: "生成图片",
    position: { x: 120, y: 80 },
    width: 320,
    height: 320,
    metadata: { content: "/api/reference-assets/permanent/generated-image.png" },
};

const noop = () => undefined;

function srcAt(scale: number, node: CanvasNodeData = imageNode) {
    const markup = renderToStaticMarkup(
        <NodeContent
            node={node}
            theme={canvasThemes.light}
            scale={scale}
            isEditingContent={false}
            textareaRef={{ current: null }}
            isBatchRoot={false}
            batchCount={0}
            batchExpanded={false}
            batchOpening={false}
            batchRecovering={false}
            onContentChange={noop}
            onStopEditing={noop}
            mentionReferences={[]}
        />,
    );
    const match = markup.match(/src="([^"]*generated-image[^"]*)"/);
    return match ? match[1].replace(/&amp;/g, "&") : null;
}

describe("PROBE: zoom -> image src churn", () => {
    it("A. width bucket across a zoom sweep (DPR 1, node 320)", () => {
        console.log("\n=== A. DPR 1, node width 320 ===");
        [0.5, 0.75, 1, 1.1, 1.2, 1.3, 1.43, 1.5, 1.8, 2, 2.5, 3, 4, 5].forEach((scale) => {
            const width = canvasImagePreviewWidth(imageNode.width, scale);
            console.log(`scale=${scale}\twidth=${width}\t${imagePreviewUrl(imageNode.metadata!.content!, width)}`);
        });
        expect(true).toBe(true);
    });

    it("B. distinct srcs across a realistic wheel sweep", () => {
        // handleWheel (canvas-surface.tsx:658): factor = 1.1 ** (-deltaY/100).
        // One standard wheel notch is deltaY=100 => factor 1.1 per notch.
        const scales: number[] = [];
        let k = 1;
        for (let i = 0; i < 12; i += 1) {
            k = Math.min(5, k * 1.1);
            scales.push(k);
        }
        console.log("\n=== B. 12 wheel notches from k=1 ===");
        const urls = scales.map((scale) => {
            const url = srcAt(scale);
            console.log(`k=${scale.toFixed(3)}\t${url}`);
            return url;
        });
        const changes = urls.filter((url, index) => index > 0 && url !== urls[index - 1]).length;
        console.log(`distinct srcs = ${new Set(urls).size} / ${urls.length} steps; src CHANGED ${changes} times`);
        expect(true).toBe(true);
    });

    it("C. does metadata.naturalWidth cap the churn?", () => {
        const capped: CanvasNodeData = { ...imageNode, metadata: { ...imageNode.metadata, naturalWidth: 1024, naturalHeight: 1024 } };
        console.log("\n=== C1. naturalWidth = 1024 ===");
        [1, 1.5, 2, 2.5, 3, 4, 5].forEach((scale) => console.log(`k=${scale}\twidth=${canvasImagePreviewWidth(capped.width, scale, 1024)}\t${srcAt(scale, capped)}`));
        console.log("=== C2. naturalWidth absent ===");
        [1, 1.5, 2, 2.5, 3, 4, 5].forEach((scale) => console.log(`k=${scale}\twidth=${canvasImagePreviewWidth(imageNode.width, scale)}\t${srcAt(scale)}`));
        expect(true).toBe(true);
    });

    it("D. the exact case in the screenshot: 143%", () => {
        const before = srcAt(1.3);
        const after = srcAt(1.43);
        console.log(`\n=== D. 130% -> 143% ===\nk=1.30 -> ${before}\nk=1.43 -> ${after}\nsrc changed: ${before !== after}`);
        expect(before).toBeTruthy();
    });

    it("E. lazy/decoding attrs present on the img", () => {
        const markup = renderToStaticMarkup(
            <NodeContent
                node={imageNode}
                theme={canvasThemes.light}
                scale={1.43}
                isEditingContent={false}
                textareaRef={{ current: null }}
                isBatchRoot={false}
                batchCount={0}
                batchExpanded={false}
                batchOpening={false}
                batchRecovering={false}
                onContentChange={noop}
                onStopEditing={noop}
                mentionReferences={[]}
            />,
        );
        console.log(`\n=== E. img attrs ===\nloading="lazy" present: ${markup.includes('loading="lazy"')}`);
        console.log(`decoding="async" present: ${markup.includes('decoding="async"')}`);
        console.log(`backdrop-blur occurrences in one image node: ${(markup.match(/backdrop-blur/g) || []).length}`);
        expect(true).toBe(true);
    });
});
