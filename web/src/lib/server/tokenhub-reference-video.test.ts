import { describe, expect, it } from "vitest";
import { createVideoReferenceConversionProof, inspectTokenHubReference, tokenHubReferenceApplies, verifyVideoReferenceConversionProof } from "./tokenhub-reference-video";

const base = { container: "mov,mp4,m4a,3gp,3g2,mj2", brand: "isom", bytes: 753633, duration: 10.03, width: 656, height: 1280, fps: 30 };

describe("TokenHub reference video", () => {
    it("binds conversion consent to the original request and expiry", () => {
        const now = 1795251530000;
        const proof = createVideoReferenceConversionProof("user+request+refs", now);
        expect(verifyVideoReferenceConversionProof("user+request+refs", proof, now)).toBe(true);
        expect(verifyVideoReferenceConversionProof("other refs", proof, now)).toBe(false);
        expect(verifyVideoReferenceConversionProof("user+request+refs", proof, now + 15 * 60000)).toBe(false);
    });
    it("only applies to the intended channel and model family", () => {
        const channel = { channelId: "wD0cO6S6cyhbyvYIRDE28", model: "cdance2.0-fast-0807", advancedConfig: { protocol: "seedance" } };
        expect(tokenHubReferenceApplies(channel)).toBe(true);
        expect(tokenHubReferenceApplies({ ...channel, channelId: "other" })).toBe(false);
    });
    it("accepts valid parameters without guessing the resolution tier", () => {
        expect(inspectTokenHubReference(base)).toEqual({ issues: [], convertible: true });
    });
    it("flags average FPS and does not convert invalid duration", () => {
        expect(inspectTokenHubReference({ ...base, fps: 20.1 })).toMatchObject({ convertible: true, issues: [expect.stringContaining("20.1")] });
        expect(inspectTokenHubReference({ ...base, duration: 30.01 })).toMatchObject({ convertible: false });
        expect(inspectTokenHubReference({ ...base, fps: 0 })).toMatchObject({ convertible: false });
    });
    it("accepts inclusive FPS limits and flags undecodable geometry, over-size and pixel limits", () => {
        expect(inspectTokenHubReference({ ...base, fps: 24, bytes: 200000000 }).issues).toEqual([]);
        expect(inspectTokenHubReference({ ...base, fps: 60 }).issues).toEqual([]);
        expect(inspectTokenHubReference({ ...base, width: 0 }).convertible).toBe(false);
        expect(inspectTokenHubReference({ ...base, width: 300, height: 300, bytes: 200000001 }).issues).toHaveLength(2);
    });
});
