import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GenerationLogAsset, StoredGenerationLog } from "@/lib/server/generation-log-types";
import { GenerationLogAssetPreview, GenerationLogDetail, GenerationLogMobileCard } from "./admin-generation-log";

const platformUrl = "/api/generation-log-assets/permanent/2026/11/24/images/fixture.png";
const remoteUrl = "https://storage.example.test/image.png?Expires=1";

function logWith(asset: GenerationLogAsset): StoredGenerationLog {
    return {
        id: "log-1",
        userId: "fixture-user",
        username: "fixture",
        displayName: "Fixture",
        kind: asset.type,
        source: "canvas",
        status: "success",
        title: "Fixture",
        prompt: "",
        model: "fixture-model",
        summary: "",
        durationMs: 120,
        count: 1,
        successCount: 1,
        failCount: 0,
        assets: [asset],
        createdAt: "2026-11-24T05:48:56.000Z",
        updatedAt: "2026-11-24T05:49:48.000Z",
    };
}

function renderPreviews(asset: GenerationLogAsset) {
    const log = logWith(asset);
    return [
        renderToStaticMarkup(<GenerationLogAssetPreview log={log} />),
        renderToStaticMarkup(<GenerationLogMobileCard log={log} selected={false} onSelectedChange={() => {}} onView={() => {}} onDelete={() => {}} />),
        renderToStaticMarkup(<GenerationLogDetail log={log} />),
    ];
}

describe("admin generation log media previews", () => {
    it.each([
        { type: "image" as const, url: remoteUrl, serverUrl: platformUrl, remoteUrl },
        { type: "image" as const, url: platformUrl, remoteUrl },
        { type: "image" as const, url: platformUrl, serverUrl: "https://storage.example.test/api/generation-log-assets/not-local.png", remoteUrl },
    ])("prefers the registered image over the temporary upstream URL (%j)", (asset) => {
        const markup = renderPreviews(asset);
        expect(markup[0]).toContain(`src="${platformUrl}?format=webp&amp;width=256"`);
        expect(markup[1]).toContain(`src="${platformUrl}?format=webp&amp;width=256"`);
        expect(markup[2]).toContain(`src="${platformUrl}?format=webp&amp;width=960"`);
        expect(markup.join("")).not.toContain(remoteUrl);
    });

    it("keeps using the remote URL for remote-only image records", () => {
        for (const markup of renderPreviews({ type: "image", url: remoteUrl, remoteUrl })) expect(markup).toContain(`src="${remoteUrl}"`);
    });

    it.each(["video", "audio"] as const)("does not change %s source priority", (type) => {
        const markup = renderToStaticMarkup(<GenerationLogDetail log={logWith({ type, url: platformUrl, serverUrl: platformUrl, remoteUrl })} />);
        expect(markup).toContain(`src="${remoteUrl}"`);
    });
});
