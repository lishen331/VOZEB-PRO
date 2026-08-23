import { DramaWorkflowLabProject } from "../drama-workflow-lab-project-complete";

export default async function DramaLabCreatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ episode?: string }> }) {
    const { id } = await params;
    const { episode } = await searchParams;

    return <DramaWorkflowLabProject projectId={id} initialEpisodeId={episode} />;
}
