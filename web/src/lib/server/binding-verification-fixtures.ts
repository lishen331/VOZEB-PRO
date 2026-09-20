import sharp from "sharp";

/** Immutable, non-user fixtures shared by preview and the exact provider request. */
export async function bindingVerificationFixtures() {
    return Promise.all(
        [0, 1, 2].map((index) =>
            sharp(
                Buffer.from(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="480"><rect width="768" height="480" fill="#f7f5ef"/><rect y="330" width="768" height="150" fill="#e5e7eb"/><ellipse cx="${190 + index * 50}" cy="345" rx="90" ry="15" fill="#cbd5e1"/><circle cx="${190 + index * 50}" cy="255" r="85" fill="#f97316"/><rect x="390" y="220" width="120" height="120" rx="4" fill="#2563eb"/><ellipse cx="610" cy="265" rx="66" ry="72" fill="none" stroke="#16a34a" stroke-width="22"/><text x="30" y="55" font-size="28" fill="#334155">REFERENCE ${index + 1}</text></svg>`,
                ),
            )
                .png()
                .toBuffer(),
        ),
    );
}

let referenceVideo: Promise<Buffer> | undefined;
/** Local fixture encoding only; this never calls a model or incurs provider generation fees. */
export function bindingVerificationVideoFixture() {
    referenceVideo ??= (async () => {
        const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");
        const { runFfmpeg } = await import("./ffmpeg");
        const dir = await mkdtemp(join(tmpdir(), "binding-video-fixture-"));
        try {
            const input = join(dir, "reference.png"),
                output = join(dir, "reference.mp4");
            await writeFile(input, (await bindingVerificationFixtures())[0]);
            await runFfmpeg(["-v", "error", "-loop", "1", "-i", input, "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output]);
            return await readFile(output);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    })().catch((error) => {
        referenceVideo = undefined;
        throw error;
    });
    return referenceVideo;
}
