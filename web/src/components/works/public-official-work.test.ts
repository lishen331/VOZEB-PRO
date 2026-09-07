import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("official public work presentation", () => {
    it("exposes official origin, avoids creator navigation, supports audio, and hides empty prompt actions", async () => {
        const [view, card, media, preview, service] = await Promise.all([
            readFile(resolve(process.cwd(), "src/lib/server/public-work-view.ts"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-gallery-card.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-media-browser.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-preview-modal.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/lib/server/work-publication-service.ts"), "utf8"),
        ]);
        expect(view).toContain("publicationOrigin: item.publicationOrigin");
        expect(card).toContain("平台官方");
        expect(card).toContain('publicationOrigin === "official"');
        expect(media).toContain("<audio");
        expect(media).toContain('asset.mediaType === "audio"');
        expect(service).toContain('asset.mediaType === "audio"');
        expect(preview).toContain("Boolean(work?.publicPrompt.trim())");
        expect(preview).toContain("该作品暂无可公开提示词");
    });
});
