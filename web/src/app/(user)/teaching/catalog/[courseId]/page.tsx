"use client";

import { useParams } from "next/navigation";

import { CatalogCourseDetail } from "./catalog-course-detail";

/** L1.5 课程详情：/teaching/catalog/<课程 id>，层级见 teaching-routes.ts */
export default function TeachingCatalogCoursePage() {
    const params = useParams<{ courseId: string }>();
    return <CatalogCourseDetail courseId={params.courseId} />;
}
