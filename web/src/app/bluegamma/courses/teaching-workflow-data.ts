/*
 * 教学中心 · 我的班级/作业/学生提交/商单任务的演示数据（本地模拟，不调接口）。
 * 字段形状对照线上 lib/school-domain.ts 的 SchoolCourseOffering / TeachingAssignment /
 * TeachingSubmission / SchoolCommercialOrder，这样设计稿定下来后能直接套回真实页面。
 */

export type AssignmentStatus = "draft" | "published" | "closed";
export type AssignmentKind = "lesson" | "practice" | "commercial_practice";
export type SubmissionStatus = "submitted" | "reviewed" | "revision_required";
export type CommercialOrderStatus = "assigned" | "in_progress" | "submitted" | "revision_required" | "accepted";

export interface TeachingAssignmentItem {
    id: string;
    title: string;
    instructions: string;
    kind: AssignmentKind;
    status: AssignmentStatus;
    courseTitle: string;
    className: string;
    submittedCount: number;
    totalStudents: number;
}

export const TEACHING_ASSIGNMENTS: readonly TeachingAssignmentItem[] = [
    { id: "a1", title: "第 4 课随堂练习：客厅软装搭配", instructions: "按课件要求完成一套客厅软装方案，上传效果图与说明。", kind: "lesson", status: "published", courseTitle: "室内设计基础", className: "室内 2301", submittedCount: 9, totalStudents: 14 },
    { id: "a2", title: "单元实训：新中式服装系列", instructions: "结合宋锦面料做一组 3 件以上的系列设计。", kind: "practice", status: "published", courseTitle: "服装设计导论", className: "服装 2301", submittedCount: 4, totalStudents: 13 },
    { id: "a3", title: "期末作业：毕业展板初稿", instructions: "提交展板初稿，包含作品集封面与 3 个版式。", kind: "lesson", status: "draft", courseTitle: "室内设计基础", className: "室内 2302", submittedCount: 0, totalStudents: 12 },
    { id: "a4", title: "第 2 课课后作业：动线草图", instructions: "画出至少两种动线方案并标注尺寸。", kind: "lesson", status: "closed", courseTitle: "室内设计基础", className: "室内 2301", submittedCount: 14, totalStudents: 14 },
];

export interface TeachingSubmissionItem {
    id: string;
    assignmentId: string;
    studentName: string;
    accountId: string;
    submittedAt: string;
    note: string;
    referenceCount: number;
    status: SubmissionStatus;
    feedback?: string;
}

export const TEACHING_SUBMISSIONS: readonly TeachingSubmissionItem[] = [
    { id: "s1", assignmentId: "a1", studentName: "林一诺", accountId: "VZ-10231", submittedAt: "2026-10-21 14:20", note: "参考了北欧风客厅案例，灯光部分还在调整。", referenceCount: 2, status: "submitted" },
    { id: "s2", assignmentId: "a1", studentName: "陈子涵", accountId: "VZ-10244", submittedAt: "2026-10-21 16:05", note: "已按课件完成，附三视图。", referenceCount: 3, status: "reviewed", feedback: "空间比例把握不错，光影细节可以再加强。" },
    { id: "s3", assignmentId: "a1", studentName: "张雨桐", accountId: "VZ-10255", submittedAt: "2026-10-20 09:40", note: "", referenceCount: 1, status: "revision_required", feedback: "家具尺寸和平面图不一致，请重新核对。" },
    { id: "s4", assignmentId: "a2", studentName: "王思远", accountId: "VZ-11021", submittedAt: "2026-10-19 20:10", note: "系列主题：江南雨巷。", referenceCount: 4, status: "submitted" },
];

export interface CommercialOrderItem {
    id: string;
    title: string;
    requirements: string;
    acceptanceCriteria: string;
    deadline: string;
    status: CommercialOrderStatus;
    participants: { name: string; submitted: boolean }[];
    platformFeedback?: string;
}

export const COMMERCIAL_ORDERS: readonly CommercialOrderItem[] = [
    {
        id: "o1",
        title: "某品牌春季上新 · 主视觉海报",
        requirements: "围绕「新中式春夏」主题产出 3 版主视觉，含竖版与横版。",
        acceptanceCriteria: "品牌色不可偏移超过 10%，需保留 Logo 安全区。",
        deadline: "2026-10-28 18:00",
        status: "in_progress",
        participants: [
            { name: "林一诺", submitted: true },
            { name: "陈子涵", submitted: false },
        ],
    },
    {
        id: "o2",
        title: "校企合作 · 毕设展板印刷稿",
        requirements: "按学校展板模板排版，提交可印刷的高清文件。",
        acceptanceCriteria: "分辨率不低于 300dpi，出血位 3mm。",
        deadline: "2026-11-05 12:00",
        status: "submitted",
        participants: [{ name: "王思远", submitted: true }],
        platformFeedback: "展板右下角二维码被遮挡，请调整版式后重新交付。",
    },
    {
        id: "o3",
        title: "文创品牌 · 包装插画",
        requirements: "为茉莉花茶礼盒绘制一组插画，风格参考新国潮。",
        acceptanceCriteria: "插画需可无缝延展到罐身与礼盒侧面。",
        deadline: "2026-11-12 18:00",
        status: "accepted",
        participants: [{ name: "张雨桐", submitted: true }],
    },
];
