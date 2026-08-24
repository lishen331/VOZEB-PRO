import { notFound } from "next/navigation";

import { DRAMA_WORKFLOW_LAB_ENV, isDramaWorkflowLabEnabled } from "@/lib/drama-workflow-lab";

import { DramaWorkflowLabHome } from "./drama-workflow-lab-home";

export const dynamic = "force-dynamic";

export default function DramaWorkflowLabPage() {
    if (!isDramaWorkflowLabEnabled(process.env[DRAMA_WORKFLOW_LAB_ENV])) notFound();
    return <DramaWorkflowLabHome />;
}
