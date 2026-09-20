import { bindingVerificationFixtures, bindingVerificationVideoFixture } from "@/lib/server/binding-verification-fixtures";
export const runtime = "nodejs";
// These three immutable, non-user fixtures intentionally require no login: upstream providers fetch them.
export async function GET(_request: Request, context: { params: Promise<{ index: string }> }) {
    const { index } = await context.params;
    if (index === "video") return new Response(new Uint8Array(await bindingVerificationVideoFixture()), { headers: { "content-type": "video/mp4", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
    if (!/^[012]$/.test(index)) return new Response("Not found", { status: 404 });
    const fixtures = await bindingVerificationFixtures();
    return new Response(new Uint8Array(fixtures[Number(index)]), { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff" } });
}
