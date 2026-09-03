import { FileText, HelpCircle, Image as ImageIcon, Music2, Video } from "lucide-react";

import type { TeachingSubmissionReferencePreview } from "@/lib/school-domain";

export function SubmissionReferenceList({ references }: { references?: TeachingSubmissionReferencePreview[] }) {
    if (!references?.length) return null;
    return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {references.map((item) => (
                <article key={`${item.reference.type}:${item.reference.id}`} className="min-w-0 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                    <div className="flex min-w-0 items-center gap-2">
                        <ReferenceIcon mediaType={item.mediaType} />
                        <span className="min-w-0 truncate text-sm font-medium">{item.title}</span>
                    </div>
                    {item.availability === "unavailable" ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{item.unavailableReason || "成果当前不可用，仍保留原引用记录"}</p> : <ReferenceMedia item={item} />}
                </article>
            ))}
        </div>
    );
}

function ReferenceMedia({ item }: { item: TeachingSubmissionReferencePreview }) {
    if (!item.previewUrl) return <p className="mt-2 text-xs leading-5 text-zinc-500">文本成果，无在线预览</p>;
    if (item.mediaType === "image") return <img className="mt-2 max-h-48 w-full rounded object-contain" src={item.previewUrl} alt={item.title} />;
    if (item.mediaType === "video") return <video className="mt-2 max-h-48 w-full rounded bg-black object-contain" src={item.previewUrl} controls preload="metadata" />;
    if (item.mediaType === "audio") return <audio className="mt-2 w-full" src={item.previewUrl} controls preload="metadata" />;
    return (
        <a className="mt-2 block truncate text-sm text-blue-600 hover:underline dark:text-blue-400" href={item.previewUrl} target="_blank" rel="noreferrer">
            查看成果文件
        </a>
    );
}

function ReferenceIcon({ mediaType }: { mediaType: TeachingSubmissionReferencePreview["mediaType"] }) {
    const Icon = mediaType === "image" ? ImageIcon : mediaType === "video" ? Video : mediaType === "audio" ? Music2 : mediaType === "text" ? FileText : HelpCircle;
    return <Icon className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />;
}
