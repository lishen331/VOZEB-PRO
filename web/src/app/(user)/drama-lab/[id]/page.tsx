import { notFound } from "next/navigation";

import { DRAMA_WORKFLOW_LAB_ENV, isDramaWorkflowLabEnabled } from "@/lib/drama-workflow-lab";

import { DramaWorkflowLabProject } from "./drama-workflow-lab-project";

export const dynamic = "force-dynamic";

export default async function DramaWorkflowLabProjectPage({ params }: { params: Promise<{ id: string }> }) {
    if (!isDramaWorkflowLabEnabled(process.env[DRAMA_WORKFLOW_LAB_ENV])) notFound();
    const { id } = await params;
    return <DramaWorkflowLabProject projectId={id} />;
}
