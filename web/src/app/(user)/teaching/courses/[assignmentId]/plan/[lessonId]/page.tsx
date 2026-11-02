"use client";

import { useParams, useSearchParams } from "next/navigation";

import { TeachingLessonPlanPage } from "./teaching-lesson-plan-page";

/** L3 教案全屏页：/teaching/courses/<assignmentId>/plan/<lessonId>，层级见 teaching-routes.ts */
export default function LessonPlanPage() {
    const params = useParams<{ assignmentId: string; lessonId: string }>();
    const search = useSearchParams();
    return <TeachingLessonPlanPage assignmentId={params.assignmentId} lessonId={params.lessonId} from={search.get("from")} />;
}
