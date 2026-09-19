"use client";
import { Button, message } from "antd";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { DramaProject } from "@/lib/drama-project-contract";
type Target = "image" | "video" | "first" | "key" | "last";
const labels: Record<Target, string> = { image: "上传分镜图", video: "上传视频", first: "上传首帧", key: "上传关键帧", last: "上传尾帧" };
export function OneClickShotMediaUpload({ projectId, episodeId, shotId, target, disabled, onProjectChange }: { projectId: string; episodeId: string; shotId: string; target: Target; disabled?: boolean; onProjectChange: (project: DramaProject) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    async function upload(file: File) {
        setBusy(true);
        try {
            const form = new FormData();
            form.set("file", file);
            const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}/upload?episodeId=${encodeURIComponent(episodeId)}&target=${target}`, { method: "POST", body: form });
            const payload = (await response.json()) as { code: number; msg?: string; data?: { project?: DramaProject } };
            if (!response.ok || payload.code !== 0 || !payload.data?.project) throw new Error(payload.msg || "上传失败");
            onProjectChange(payload.data.project);
            message.success("上传成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setBusy(false);
        }
    }
    return (
        <>
            <Button
                size="small"
                icon={<Upload className="size-4" />}
                loading={busy}
                disabled={disabled}
                onClick={(event) => {
                    event.stopPropagation();
                    input.current?.click();
                }}
            >
                {labels[target]}
            </Button>
            <input
                ref={input}
                type="file"
                hidden
                accept={target === "video" ? "video/mp4,video/webm,video/quicktime" : "image/png,image/jpeg,image/webp,image/gif"}
                aria-label={labels[target]}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                }}
            />
        </>
    );
}
