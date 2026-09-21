import { describe, expect, it } from "vitest";
import { assertCustomProtocolReferenceMapping } from "./custom-protocol-reference-preflight";
const config = (requestTemplate: string) => ({ protocol: "custom" as const, capability: "video" as const, requestTemplate });
describe("offline custom reference preflight", () => {
    it("blocks missing material mappings before any generation", () => {
        expect(() => assertCustomProtocolReferenceMapping(config('{"input":{"prompt":"{{prompt}}"}}'), [{ type: "image" }])).toThrow("尚未发起生成");
    });
    it("accepts mixed arrays and does not invent provider field names", () => {
        expect(() => assertCustomProtocolReferenceMapping(config('{"input":{"provider_images":"{{images}}","provider_videos":"{{videos}}"}}'), [{ type: "image" }, { type: "image" }, { type: "video" }])).not.toThrow();
    });
    it("rejects two images mapped to a single image or placeholder only in prose", () => {
        expect(() => assertCustomProtocolReferenceMapping(config('{"input":{"image":"{{image}}"}}'), [{ type: "image" }, { type: "image" }])).toThrow("2");
        expect(() => assertCustomProtocolReferenceMapping(config('{"prompt":"describe {{images}}"}'), [{ type: "image" }])).toThrow();
    });
    it("permits no-reference tests and leaves built-in protocols to their adapters", () => {
        expect(() => assertCustomProtocolReferenceMapping(config("{}"), [])).not.toThrow();
        expect(() => assertCustomProtocolReferenceMapping({ protocol: "openai", capability: "video" }, [{ type: "image" }])).not.toThrow();
    });
    it("accepts first-last frame and mixed structured content mappings", () => {
        expect(() => assertCustomProtocolReferenceMapping(config('{"first":"{{first_frame_url}}","last":"{{last_frame_url}}"}'), [{ type: "image" }, { type: "image" }])).not.toThrow();
        expect(() => assertCustomProtocolReferenceMapping(config('{"content":"{{content}}"}'), [{ type: "image" }, { type: "video" }])).not.toThrow();
    });
});
