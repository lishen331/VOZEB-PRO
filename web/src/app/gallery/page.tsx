import { permanentRedirect } from "next/navigation";

export default async function GalleryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
        for (const entry of Array.isArray(value) ? value : value ? [value] : []) params.append(key, entry);
    }
    permanentRedirect(`/community${params.size ? `?${params.toString()}` : ""}`);
}
