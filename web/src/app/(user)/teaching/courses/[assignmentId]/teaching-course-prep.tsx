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
import { AnimatePresence } from "motion/react";
import { coursesApi } from "@/services/api/courses";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { AssignmentCreateModal } from "@/app/(user)/teaching/teaching-assignment-modal";
import { flattenLessons, parseTeachingTab, prepBackHref, resolvePrepLesson, teachingCourseHref, teachingHref, TEACHING_TAB_LABELS } from "@/app/(user)/teaching/teaching-routes";
import { usePreparedLessons } from "@/app/(user)/teaching/use-prepared-lessons";
import { PrepBackLink, PrepLayout, PrepSkeleton } from "./prep-layout";
import { PlanEditor } from "./prep-plan-editor";
import { PrepRehearsal } from "./prep-rehearsal";
import { useLessonPlan } from "./use-lesson-plan";

/*
 * L2 课程备课页（上一级：教学中心 /teaching 的「备课」或其他来源标签）。
 * 三栏布局复用 /bluegamma/courses 的备课页：左大纲 · 中资料预览 · 右教案 / 课程说明 / 资料 / 作业。
 * 备课闭环：看资料 → 写教案（自动保存到后端）→ 标记已备（检查完整度）→ 试讲（按环节计时，不绑定班级）→ 写反思。
 *   返回：左上角按钮 → from 对应的教学中心标签；浏览器后退效果相同（切课时用 replace，不堆历史）
 *   放映、试讲、布置作业、重命名 / 删除资料：都是本页浮层
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
    const context = useSchoolContextStore((state) => state.context);
    const isTeacher = context?.membership.role === "teacher";
    const { prepared, drafted, refresh: refreshProgress } = usePreparedLessons(isTeacher, assignmentId);
    const [state, setState] = useState<LoadState>({ status: "loading" });
    const [offerings, setOfferings] = useState<SchoolCourseOffering[]>([]);
    const [assignments, setAssignments] = useState<TeachingAssignment[]>([]);
    const [busy, setBusy] = useState(false);
    const [assignmentOpen, setAssignmentOpen] = useState(false);
    const [rehearsing, setRehearsing] = useState(false);

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
    const courseDrafted = drafted[assignmentId] ?? [];
    const lesson = resolvePrepLesson(lessons, search.get("lesson"), coursePrepared);
    const plan = useLessonPlan(assignmentId, isTeacher ? lesson : null, refreshProgress);
    const planReady = plan.load.phase === "ready" && plan.doc?.lessonId === lesson?.id && plan.saveState !== "conflict";

    // 标记已备：先存再检查完整度；缺项时把要补的内容列出来
    const togglePrepared = async (done: boolean) => {
        try {
            const missing = await plan.setReady(done);
            if (missing.length) {
                modal.warning({
                    title: "教案还差几项才能标记已备",
                    content: (
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px]">
                            {missing.map((item) => (
                                <li key={item}>{item}</li>
                            ))}
                        </ul>
                    ),
                    okText: "去补充",
                });
                return;
            }
            message.success(done ? "已标记为备好，可以试讲一遍" : "已改回草稿");
        } catch (error) {
            message.error(errorMessage(error, "标记失败"));
        }
    };

    const startRehearsal = async () => {
        if (!plan.doc?.content.phases.length) {
            message.warning("先在教案里安排至少 1 个教学环节");
            return;
        }
        try {
            // 试讲记录挂在已保存的教案上：起步模板或有未保存修改时先存一次
            if (plan.dirty || plan.doc.isStarter) await plan.save();
            setRehearsing(true);
        } catch (error) {
            message.error(errorMessage(error, "教案保存失败，暂时不能试讲"));
        }
    };

    // 切课时：只换地址参数，不新增历史记录，后退仍回到上一级
    const pickLesson = useCallback((lessonId: string) => router.replace(teachingCourseHref(assignmentId, { lessonId, from: fromTab }), { scroll: false }), [assignmentId, fromTab, router]);

    // 地址里没指定课时时，自动打开的是「第一节没备的」；把它写进地址固定下来，
    // 否则老师刚标记已备，这条规则就会把页面跳到下一节课
    const requestedLessonId = search.get("lesson");
    const resolvedLessonId = lesson?.id;
    useEffect(() => {
        if (!requestedLessonId && resolvedLessonId) pickLesson(resolvedLessonId);
    }, [pickLesson, requestedLessonId, resolvedLessonId]);

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
                drafted={courseDrafted}
                offerings={offerings}
                assignments={assignments}
                backHref={backHref}
                backLabel={backLabel}
                canMarkPrepared={planReady}
                canRehearse={planReady}
                planEditor={
                    isTeacher ? (
                        <PlanEditor
                            doc={plan.doc?.lessonId === lesson?.id ? plan.doc : null}
                            load={plan.load}
                            materials={lesson?.materials ?? []}
                            saveState={plan.saveState}
                            saveError={plan.saveError}
                            savedAt={plan.savedAt}
                            dirty={plan.dirty}
                            onUpdate={plan.update}
                            onRetrySave={() => void plan.save().catch(() => undefined)}
                            onReload={plan.reload}
                            onOverwrite={() => void plan.overwrite().catch((error: unknown) => message.error(errorMessage(error, "保存失败")))}
                        />
                    ) : (
                        <p className="text-[13px] text-[var(--gm-text-3)]">教案只对任课老师开放。</p>
                    )
                }
                onPickLesson={pickLesson}
                onTogglePrepared={(_lessonId, done) => void togglePrepared(done)}
                onRehearse={() => void startRehearsal()}
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
            <AnimatePresence>
                {rehearsing && lesson && plan.doc ? (
                    <PrepRehearsal
                        caption={`第 ${lesson.number} 课 ${lesson.title}`}
                        content={plan.doc.content}
                        materials={lesson.materials}
                        onFinish={async (input) => {
                            try {
                                await plan.recordRehearsal(input);
                                message.success("试讲记录已保存，可以在教案里看到各环节用时");
                            } catch (error) {
                                message.error(errorMessage(error, "试讲记录保存失败"));
                                throw error;
                            }
                        }}
                        onClose={() => setRehearsing(false)}
                    />
                ) : null}
            </AnimatePresence>
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
