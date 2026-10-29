"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App } from "@/components/gamma-ui/gamma-ant-app";
import { BookOpen } from "lucide-react";

import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import type { PlatformCourseDetail, SchoolCourseOffering, TeachingAssignment } from "@/lib/school-domain";
import { coursesApi } from "@/services/api/courses";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { useUserStore } from "@/stores/use-user-store";
import { AssignmentCreateModal } from "@/app/(user)/teaching/teaching-assignment-modal";
import { flattenLessons, parseTeachingTab, prepBackHref, resolvePrepLesson, teachingCourseHref, teachingHref, TEACHING_TAB_LABELS } from "@/app/(user)/teaching/teaching-routes";
import { usePreparedLessons } from "@/app/(user)/teaching/use-prepared-lessons";
import { PrepBackLink, PrepLayout, PrepSkeleton } from "./prep-layout";

/*
 * L2 课程备课页（上一级：教学中心 /teaching 的「备课」或其他来源标签）。
 * 三栏布局复用 /bluegamma/courses 的备课页：左大纲 · 中资料预览 · 右课时说明 / 资料 / 作业。
 *   返回：左上角按钮 → from 对应的教学中心标签；浏览器后退效果相同（切课时用 replace，不堆历史）
 *   放映、布置作业、重命名 / 删除资料：都是本页浮层
 */

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tree: PlatformCourseDetail };

const PAGE_SIZE = 100;

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function TeachingCoursePrep() {
    const { message, modal } = App.useApp();
    const router = useRouter();
    const params = useParams<{ assignmentId: string }>();
    const search = useSearchParams();
    const assignmentId = params.assignmentId;
    const fromTab = parseTeachingTab(search.get("from"));
    const backHref = prepBackHref(search.get("from"));
    const backLabel = TEACHING_TAB_LABELS[fromTab];
    const user = useUserStore((state) => state.user);
    const context = useSchoolContextStore((state) => state.context);
    const { prepared, toggle } = usePreparedLessons(user?.id);
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [offerings, setOfferings] = useState<SchoolCourseOffering[]>([]);
    const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
    const [busy, setBusy] = useState(false);
    const [assignmentOpen, setAssignmentOpen] = useState(false);

    const loadTree = useCallback(async () => {
        try {
            setState({ status: "ready", tree: await coursesApi.getSchoolCourseTree(assignmentId) });
        } catch (error) {
            setState({ status: "error", message: errorMessage(error, "课程内容加载失败") });
        }
    }, [assignmentId]);

    // 本课程在我负责的班级里的安排与作业（用于「布置作业」和右栏作业列表）
    const loadTeaching = useCallback(async () => {
        const [offeringResult, assignmentResult] = await Promise.allSettled([coursesApi.listTeachingOfferings({ page: 1, pageSize: PAGE_SIZE }), coursesApi.listTeachingAssignments({ page: 1, pageSize: PAGE_SIZE })]);
        const courseOfferings = offeringResult.status === "fulfilled" ? offeringResult.value.items.filter((item) => item.assignmentId === assignmentId) : [];
        const offeringIds = new Set(courseOfferings.map((item) => item.id));
        setOfferings(courseOfferings);
        setAssignments(assignmentResult.status === "fulfilled" ? assignmentResult.value.items.filter((item) => offeringIds.has(item.offeringId)) : []);
    }, [assignmentId]);

    useEffect(() => {
        setState({ status: "loading" });
        void loadTree();
        void loadTeaching();
    }, [loadTree, loadTeaching]);

    const tree = state.status === "ready" ? state.tree : null;
    const lessons = useMemo(() => (tree ? flattenLessons(tree) : []), [tree]);
    const coursePrepared = prepared[assignmentId] ?? [];
    const lesson = resolvePrepLesson(lessons, search.get("lesson"), coursePrepared);

    // 切课时：只换地址参数，不新增历史记录，后退仍回到上一级
    const pickLesson = useCallback((lessonId: string) => router.replace(teachingCourseHref(assignmentId, { lessonId, from: fromTab }), { scroll: false }), [assignmentId, fromTab, router]);

    const upload = async (file: File) => {
        if (!lesson) return;
        setBusy(true);
        let storageKey = "";
        try {
            storageKey = (await coursesApi.uploadSchoolCourseAttachment(file)).storageKey;
            await coursesApi.createSchoolCourseMaterial(assignmentId, { lessonId: lesson.id, title: file.name, storageKey, sortOrder: lesson.materials.length });
            message.success("本校补充资料已上传");
            await loadTree();
        } catch (error) {
            if (storageKey) await coursesApi.deleteSchoolCourseAttachment([storageKey]).catch(() => undefined);
            message.error(errorMessage(error, "资料上传失败"));
        } finally {
            setBusy(false);
        }
    };

    if (state.status === "loading") return <PrepSkeleton backHref={backHref} backLabel={backLabel} />;
    if (!tree) return <PrepError backHref={backHref} backLabel={backLabel} detail={state.status === "error" ? state.message : ""} />;

    return (
        <>
            <PrepLayout
                tree={tree}
                lessons={lessons}
                lesson={lesson}
                prepared={coursePrepared}
                offerings={offerings}
                assignments={assignments}
                backHref={backHref}
                backLabel={backLabel}
                onPickLesson={pickLesson}
                onTogglePrepared={(lessonId, done) => toggle(assignmentId, lessonId, done)}
                onCreateAssignment={() => setAssignmentOpen(true)}
                onOpenAssignments={() => router.push(teachingHref("assignments"))}
                materialActions={{
                    canManage: context?.membership.role === "teacher",
                    busy,
                    onUpload: (file) => void upload(file),
                    onOpen: () => undefined,
                    onRename: (material) => {
                        let title = material.title;
                        modal.confirm({
                            title: "重命名本校资料",
                            content: <Input defaultValue={material.title} maxLength={260} aria-label="资料名称" onChange={(event) => (title = event.target.value)} />,
                            okText: "保存",
                            cancelText: "取消",
                            async onOk() {
                                if (!title.trim()) {
                                    message.error("资料名称不能为空");
                                    throw new Error("资料名称不能为空");
                                }
                                await coursesApi.updateSchoolCourseMaterial(material.id, { title: title.trim() });
                                await loadTree();
                            },
                        });
                    },
                    onRemove: (material) =>
                        modal.confirm({
                            title: `删除“${material.title}”`,
                            content: "只删除本校补充资料，不影响平台标准资料。",
                            okText: "确认删除",
                            okButtonProps: { danger: true },
                            cancelText: "取消",
                            async onOk() {
                                await coursesApi.deleteSchoolCourseMaterial(material.id);
                                message.success("本校资料已删除");
                                await loadTree();
                            },
                        }),
                }}
            />
            <AssignmentCreateModal
                open={assignmentOpen}
                offerings={offerings}
                courseTrees={{ [assignmentId]: tree }}
                initial={{ offeringId: offerings.find((item) => item.status === "active")?.id, lessonId: lesson?.id, kind: "lesson" }}
                onClose={() => setAssignmentOpen(false)}
                onCreated={loadTeaching}
            />
        </>
    );
}

function PrepError({ backHref, backLabel, detail }: { backHref: string; backLabel: string; detail: string }): ReactNode {
    return (
        <main className="h-full min-h-0 overflow-y-auto px-6 py-5">
            <PrepBackLink href={backHref} label={backLabel} />
            <div className="mx-auto mt-10 max-w-xl">
                <GammaEmptyState
                    icon={<BookOpen />}
                    title="课程不存在或暂时无法打开"
                    description={detail || "课程内容加载失败"}
                    action={
                        <Link href={backHref} className="inline-flex h-9 items-center rounded-full bg-[var(--gm-accent-soft)] px-4 text-sm font-medium text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]">
                            返回教学中心
                        </Link>
                    }
                />
            </div>
        </main>
    );
}
