"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";

import { PdfPreview } from "@/components/gamma-ui/gamma-pdf-preview";
import type { CourseMaterial } from "@/lib/school-domain";
import { cn } from "@/lib/utils";

/*
 * 课程方给的教案文档（老师只读参考）：课件里上传的 .docx / .pdf 教案，
 * 直接展开就能看全文，老师对照着写自己的教案，不用切换页面。
 */

const DOC_PATTERN = /(教案|教学设计|lesson[\s_-]*plan)/i;
const DOC_MIME = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];

/** 从课时资料里挑出「教案类」文档：文件名或标题含「教案」，且是可预览的文档类型 */
export function pickLessonPlanDocs(materials: readonly CourseMaterial[]) {
    return materials.filter((material) => DOC_MIME.includes(material.mimeType) && (DOC_PATTERN.test(material.title) || DOC_PATTERN.test(material.fileName)));
}

export function LessonDocPanel({ materials }: { materials: readonly CourseMaterial[] }) {
    const docs = pickLessonPlanDocs(materials);
    const [openId, setOpenId] = useState<string | null>(docs[0]?.id ?? null);
    if (!docs.length) return null;

    return (
        <section className="rounded-[14px] bg-[var(--gm-accent-soft)] ring-1 ring-[var(--gm-accent-ring)]">
            <div className="flex items-center gap-2 px-3.5 py-2.5">
                <BookOpen className="size-4 shrink-0 text-[var(--gm-accent)]" />
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">课程方教案文档</span>
                    <span className="block text-[11px] text-[var(--gm-text-3)]">只读参考 · {docs.length} 份</span>
                </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-[var(--gm-accent-ring)] px-3.5 pt-3 pb-3.5">
                {docs.map((doc) => {
                    const open = openId === doc.id;
                    return (
                        <div key={doc.id} className="overflow-hidden rounded-[10px] bg-[var(--gm-bg-elevated)] ring-1 ring-[var(--gm-border)]">
                            <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : doc.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{doc.title}</span>
                                <ChevronDown className={cn("size-4 shrink-0 text-[var(--gm-text-3)] transition-transform", open && "rotate-180")} />
                            </button>
                            {open ? (
                                <div className="border-t border-[var(--gm-border)]">
                                    {doc.previewUrl ? (
                                        <PdfPreview src={doc.previewUrl} title={doc.title} className="h-[min(70vh,720px)] w-full rounded-none ring-0" />
                                    ) : (
                                        <div className="flex flex-col items-start gap-2 p-3">
                                            <p className="text-[12px] leading-relaxed text-[var(--gm-text-3)]">这份文档还没有生成在线预览，可以先下载再对照。</p>
                                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[image:var(--gm-gradient)] px-3 text-xs font-medium text-white">
                                                <ExternalLink className="size-3.5" />
                                                打开文档
                                            </a>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
