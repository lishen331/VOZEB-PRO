import { DramaWorkflowLabProject } from "../drama-workflow-lab-project-complete";

export default async function DramaLabCreatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ episode?: string; stage?: string }> }) {
    const { id } = await params;
    const { episode, stage } = await searchParams;

    return <DramaWorkflowLabProject projectId={id} initialEpisodeId={episode} initialStep={stage === "storyboard" ? "storyboard" : undefined} />;
}
