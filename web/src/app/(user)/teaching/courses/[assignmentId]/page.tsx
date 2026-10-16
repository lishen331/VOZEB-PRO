"use client";

import { Suspense } from "react";

import { TeachingCoursePrep } from "./teaching-course-prep";

/** L2 课程备课：/teaching/courses/<学校课程 id>?lesson=<课时 id>&from=<来源标签>，层级见 teaching-routes.ts */
export default function TeachingCoursePrepPage() {
    return (
        <Suspense>
            <TeachingCoursePrep />
        </Suspense>
    );
}
