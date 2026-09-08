import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SchoolCourseCovers } from "./school-course-covers";
import type { SchoolCourseAssignment } from "@/lib/school-domain";
it("renders three-column pure cover cards with an accessible detail action", () => {
    const item = { id: "assignment-a", course: { title: "课程标题", summary: "不可显示的摘要", content: { coverStorageKey: "permanent/a.webp" } } } as unknown as SchoolCourseAssignment;
    const html = renderToStaticMarkup(<SchoolCourseCovers items={[item]} loading={false} onOpen={() => {}} />);
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("grid-cols-1");
    expect(html).toContain("/api/school/courses/assignment-a/cover");
    expect(html).toContain('aria-label="打开课程：课程标题"');
    expect(html).not.toContain("不可显示的摘要");
    expect(html).not.toContain("<table");
});
