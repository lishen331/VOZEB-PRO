"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import type { SchoolCourseAssignment } from "@/lib/school-domain";

export function SchoolCourseCovers({ items, loading, onOpen }: { items: SchoolCourseAssignment[]; loading: boolean; onOpen: (item: SchoolCourseAssignment) => void }) {
    const [failed, setFailed] = useState<Record<string, boolean>>({});
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="课程封面" aria-busy={loading}>
            {items.map((item) => {
                const key = typeof item.course.content.coverStorageKey === "string" ? item.course.content.coverStorageKey : "";
                const url = `/api/school/courses/${encodeURIComponent(item.id)}/cover?v=${encodeURIComponent(key)}`;
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-label={`打开课程：${item.course.title}`}
                        title={item.course.title}
                        onClick={() => onOpen(item)}
                        className="relative block aspect-[4/3] w-full min-w-0 overflow-hidden rounded-lg bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        {key && !failed[url] ? (
                            <img src={url} alt={item.course.title} loading="lazy" className="absolute inset-0 h-full w-full object-contain" onError={() => setFailed((current) => ({ ...current, [url]: true }))} />
                        ) : (
                            <span className="absolute inset-0 grid place-items-center text-muted-foreground" aria-label="暂无封面">
                                <ImageIcon className="size-8" aria-hidden="true" />
                            </span>
                        )}
                    </button>
                );
            })}
            {!items.length ? <p className="col-span-full py-6 text-center text-sm text-muted-foreground">{loading ? "正在加载课程…" : "暂无已分配课程"}</p> : null}
        </div>
    );
}
