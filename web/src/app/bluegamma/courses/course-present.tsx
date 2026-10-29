"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Course, Lesson } from "@/app/bluegamma/courses/course-data";
import { CourseSlide } from "@/app/bluegamma/courses/course-slide";

/** 放映模式：全屏黑底，←/→ 翻页，Esc 退出；底部一行显示当前页讲解备注（只给老师看） */
export function CoursePresent({ course, lesson, page, onPage, onClose }: { course: Course; lesson: Lesson; page: number; onPage: (page: number) => void; onClose: () => void }) {
    const total = lesson.slides.length;
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
            if (event.key === "ArrowRight" || event.key === " ") onPage(Math.min(total - 1, page + 1));
            if (event.key === "ArrowLeft") onPage(Math.max(0, page - 1));
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose, onPage, page, total]);

    return createPortal(
        <motion.div role="dialog" aria-modal aria-label="课件放映" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
            <div className="flex min-h-0 flex-1 items-center justify-center px-16 py-8">
                <div className="aspect-video w-full max-w-[min(100%,calc((100vh-160px)*16/9))]">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={page} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden rounded-[12px]">
                            <CourseSlide course={course} lesson={lesson} slide={lesson.slides[page]} page={page + 1} />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
            <div className="flex items-center gap-4 border-t border-white/10 px-6 py-3 text-sm">
                <span className="font-mono text-white/50">
                    {page + 1} / {total}
                </span>
                <p className="min-w-0 flex-1 truncate text-white/70">备注：{lesson.slides[page].note}</p>
                <button type="button" aria-label="上一页" disabled={page === 0} onClick={() => onPage(page - 1)} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                    <ChevronLeft className="size-4" />
                </button>
                <button type="button" aria-label="下一页" disabled={page === total - 1} onClick={() => onPage(page + 1)} className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30">
                    <ChevronRight className="size-4" />
                </button>
                <button type="button" aria-label="退出放映" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 hover:bg-white/20">
                    <X className="size-4" />
                    Esc
                </button>
            </div>
        </motion.div>,
        document.body,
    );
}
