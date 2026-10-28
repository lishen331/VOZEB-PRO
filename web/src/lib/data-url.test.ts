import { describe, expect, it } from "vitest";

import { parseBase64DataUrl } from "./data-url";

describe("parseBase64DataUrl", () => {
    it("parses multi-megabyte data URLs without a regex stack overflow", () => {
        const data = "A".repeat(16 * 1024 * 1024);
        expect(parseBase64DataUrl(`data:image/png;base64,${data}`)).toEqual({ mimeType: "image/png", data });
    });

    it("matches the old regex acceptance rules", () => {
        expect(parseBase64DataUrl("data:video/mp4;base64,AAAA")).toEqual({ mimeType: "video/mp4", data: "AAAA" });
        expect(parseBase64DataUrl("data:image/png;base64,")).toBeNull();
        expect(parseBase64DataUrl("data:;base64,AAAA")).toBeNull();
        expect(parseBase64DataUrl("data:image/png,AAAA")).toBeNull();
        expect(parseBase64DataUrl("data:image/png;charset=x;base64,AAAA")).toBeNull();
        expect(parseBase64DataUrl("https://example.com/a.png")).toBeNull();
    });
});
