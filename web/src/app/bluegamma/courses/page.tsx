import { Suspense } from "react";
import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { CourseView } from "@/app/bluegamma/courses/course-view";

export const metadata: Metadata = {
    title: "蓝色伽马 BlueGamma · 课程（教师备课）",
    robots: { index: false, follow: false },
};

/** 教师备课预览（本地模拟数据，不调接口）。?c=课程 &l=课节 */
export default function BlueGammaCoursesPage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <Suspense>
                <CourseView />
            </Suspense>
        </GammaThemeProvider>
    );
}
