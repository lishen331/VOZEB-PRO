import { expect, it } from "vitest";
import { parseBindingVerificationInput } from "./binding-verification-input";
it("accepts mixed video references and text-only inputs without three-image minimum", () => {
    expect(parseBindingVerificationInput({ prompt: "test", references: [] }, "video").references).toHaveLength(0);
    expect(
        parseBindingVerificationInput(
            {
                prompt: "test",
                references: [
                    { type: "image", url: "https://fixture.test/i.png" },
                    { type: "video", url: "https://fixture.test/v.mp4" },
                ],
            },
            "video",
        ).references,
    ).toHaveLength(2);
});
it("rejects duplicate references and videos on image generation", () => {
    const video = { type: "video", url: "https://fixture.test/v.mp4" };
    expect(() => parseBindingVerificationInput({ prompt: "test", references: [video] }, "image")).toThrow();
    expect(() => parseBindingVerificationInput({ prompt: "test", references: [video, video] }, "video")).toThrow();
});
