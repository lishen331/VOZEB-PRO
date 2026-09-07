import { createPublicPromptImage, createUnavailablePublicPromptImage } from "@/lib/server/public-prompt-image";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    if (!params.get("path")) return Response.json({ code: 400, data: null, msg: "缺少图片路径" }, { status: 400 });
    try {
        const image = await createPublicPromptImage(params.get("path"), params.get("width"));
        if (!image) return Response.json({ code: 400, data: null, msg: "图片路径无效" }, { status: 400 });
        return new Response(new Uint8Array(image), {
            headers: {
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Type": "image/webp",
                "Cross-Origin-Resource-Policy": "same-origin",
                "X-Content-Type-Options": "nosniff",
                "X-Robots-Tag": "noindex, nofollow, noarchive",
            },
        });
    } catch (error) {
        console.warn("Public prompt image unavailable", error instanceof Error ? error.message : error);
        const image = await createUnavailablePublicPromptImage(params.get("width"));
        return new Response(new Uint8Array(image), {
            headers: {
                "Cache-Control": "no-store",
                "Content-Type": "image/webp",
                "Cross-Origin-Resource-Policy": "same-origin",
                "X-Content-Type-Options": "nosniff",
                "X-Robots-Tag": "noindex, nofollow, noarchive",
            },
        });
    }
}
