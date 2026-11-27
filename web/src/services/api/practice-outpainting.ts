import type { OutpaintingRecord, OutpaintingSelection } from "@/lib/practice-outpainting";
import type { PracticeImageToolTask } from "@/app/(user)/practice/components/practice-image-tool-task";

const endpoint = "/api/practice/image-tools";
export async function listPracticeOutpainting(signal?: AbortSignal): Promise<OutpaintingRecord[]> {
    const response = await fetch(`${endpoint}?history=ai-outpainting`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("暂时无法读取扩图历史");
    return (await response.json()).records;
}
export async function submitPracticeOutpainting(sourceUrl: string, outpainting: OutpaintingSelection, clientRequestId: string): Promise<PracticeImageToolTask> {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toolId: "ai-outpainting", sourceUrl, outpainting, clientRequestId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.task) throw new Error(payload.error || "扩图任务提交失败");
    return payload.task;
}
