import type {
    CourseOfferingInput,
    CourseAttachment,
    PageResult,
    PlatformCourse,
    PlatformCourseInput,
    PlatformCoursePatch,
    SchoolContentReference,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    TeachingAssignment,
    TeachingAssignmentInput,
    TeachingSubmission,
} from "@/lib/school-domain";
import { serializeApiParams } from "@/services/api/request";

export const coursesApi = {
    listPlatformCourses(input: { page?: number; pageSize?: number; keyword?: string; status?: PlatformCourse["status"] } = {}) {
        return request<PageResult<PlatformCourse>>(`/api/admin/courses${query(input)}`);
    },
    createPlatformCourse(input: PlatformCourseInput) {
        return request<PlatformCourse>("/api/admin/courses", jsonRequest("POST", input));
    },
    uploadPlatformCourseAttachment(file: File) {
        return request<CourseAttachment>("/api/admin/course-attachments", {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
            body: file,
        });
    },
    deletePlatformCourseAttachments(storageKeys: string[]) {
        return request<{ deletedFiles: number; deletedBytes: number; blocked: unknown[] }>("/api/admin/course-attachments", jsonRequest("DELETE", { storageKeys }));
    },
    updatePlatformCourse(id: string, input: PlatformCoursePatch) {
        return request<PlatformCourse>(`/api/admin/courses/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
    },
    assignCourseToSchools(id: string, schoolIds: string[]) {
        return request<SchoolCourseAssignment[]>(`/api/admin/courses/${encodeURIComponent(id)}/schools`, jsonRequest("POST", { schoolIds }));
    },
    listSchoolCourses(input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<SchoolCourseAssignment>>(`/api/school/courses${query(input)}`);
    },
    listCourseOfferings(assignmentId: string, input: { page?: number; pageSize?: number } = {}) {
        return request<PageResult<SchoolCourseOffering>>(`/api/school/courses/${encodeURIComponent(assignmentId)}/offerings${query(input)}`);
    },
    createCourseOffering(assignmentId: string, input: CourseOfferingInput) {
        return request<SchoolCourseOffering>(`/api/school/courses/${encodeURIComponent(assignmentId)}/offerings`, jsonRequest("POST", input));
    },
    listTeachingOfferings(input: { page?: number; pageSize?: number } = {}, options: RequestOptions = {}) {
        return request<PageResult<SchoolCourseOffering>>(`/api/teaching/offerings${query(input)}`, options);
    },
    listTeachingCourses(input: { page?: number; pageSize?: number } = {}, options: RequestOptions = {}) {
        return request<PageResult<SchoolCourseAssignment>>(`/api/teaching/courses${query(input)}`, options);
    },
    listTeachingAssignments(input: { page?: number; pageSize?: number } = {}, options: RequestOptions = {}) {
        return request<PageResult<TeachingAssignment>>(`/api/teaching/assignments${query(input)}`, options);
    },
    createTeachingAssignment(input: TeachingAssignmentInput & { offeringId: string }) {
        return request<TeachingAssignment>("/api/teaching/assignments", jsonRequest("POST", input));
    },
    getTeachingAssignment(id: string) {
        return request<TeachingAssignment>(`/api/teaching/assignments/${encodeURIComponent(id)}`);
    },
    updateTeachingAssignment(id: string, input: Partial<TeachingAssignmentInput>) {
        return request<TeachingAssignment>(`/api/teaching/assignments/${encodeURIComponent(id)}`, jsonRequest("PATCH", input));
    },
    listSubmissions(id: string, input: { page?: number; pageSize?: number } = {}, options: RequestOptions = {}) {
        return request<PageResult<TeachingSubmission>>(`/api/teaching/assignments/${encodeURIComponent(id)}/submissions${query(input)}`, options);
    },
    listOwnSubmissions(input: { page?: number; pageSize?: number; assignmentIds?: string[] } = {}, options: RequestOptions = {}) {
        const { assignmentIds, ...page } = input;
        return request<PageResult<TeachingSubmission>>(`/api/teaching/submissions${query({ ...page, assignmentId: assignmentIds })}`, options);
    },
    submitAssignment(id: string, input: { note?: string; references: SchoolContentReference[] }) {
        return request<TeachingSubmission>(`/api/teaching/assignments/${encodeURIComponent(id)}/submissions`, jsonRequest("POST", input));
    },
    reviewSubmission(id: string, input: { status: "reviewed" | "revision_required"; feedback: string }) {
        return request<TeachingSubmission>(`/api/teaching/submissions/${encodeURIComponent(id)}/review`, jsonRequest("POST", input));
    },
};

type RequestOptions = Pick<RequestInit, "signal">;

function query(input: Record<string, string | string[] | number | number[] | undefined>) {
    const params = serializeApiParams(input);
    return params.size ? `?${params.toString()}` : "";
}

function jsonRequest(method: "POST" | "PATCH" | "DELETE", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: number; data?: T; msg?: string } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(payload?.msg || "请求失败");
    return payload.data;
}
