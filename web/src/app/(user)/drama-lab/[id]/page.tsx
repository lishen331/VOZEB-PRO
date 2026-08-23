import { redirect } from "next/navigation";

export default async function DramaLabProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    // 重定向到项目大纲页
    redirect(`/drama-lab/${encodeURIComponent(id)}/outline`);
}
