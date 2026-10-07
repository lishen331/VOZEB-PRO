import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { bindingVerificationFixtures } from "@/lib/server/binding-verification-fixtures";
import { buildOpenAiVideoFormData } from "./video-task-openai";

it("carries the selected image source digest in the OpenAI multipart input_reference filename", async () => {
    const bytes = (await bindingVerificationFixtures())[0];
    const sourceDigest = createHash("sha256").update(bytes).digest("hex");
    const form = await buildOpenAiVideoFormData({
        model: "video-model",
        prompt: "animate",
        seconds: 5,
        width: 640,
        height: 480,
        imageUrls: [`data:image/png;base64,${bytes.toString("base64")}`],
        origin: "https://app.example",
        cookie: "",
    });
    const file = form.get("input_reference");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe(`input-reference-${sourceDigest}.jpg`);
    expect((file as File).type).toBe("image/jpeg");
});
