import { courseBySlug, type Course } from "@/app/bluegamma/courses/course-data";

/*
 * 教师看板的演示数据（确定性生成，刷新不变；不调接口）。
 * 一个班 = 一门课 + 一批学生；每个学生在每一步有完成度 0..1，null 表示还没走到。
 */

export interface TeachStudent {
    name: string;
    progress: readonly (number | null)[];
    lastActive: string;
}

export interface TeachClass {
    id: string;
    name: string;
    course: Course;
    students: readonly TeachStudent[];
    schedule: { weekday: string; time: string; room: string; lessonIndex: number };
}

const SURNAMES = "林陈张王李赵周吴郑孙许何";
const GIVEN = ["一诺", "子涵", "雨桐", "思远", "可欣", "浩然", "若溪", "嘉怡", "梓轩", "语嫣", "俊熙", "书瑶", "沐辰", "欣妍", "皓轩", "安琪"];

/** 小型确定性随机（mulberry32），保证演示数据每次一样 */
function rng(seed: number) {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function makeStudents(seed: number, count: number, steps: number, stuckAt: number): TeachStudent[] {
    const random = rng(seed);
    return Array.from({ length: count }, (_, index) => {
        // 每个学生走到第几步：大部分人卡在 stuckAt 附近
        const reach = Math.min(steps, Math.max(1, Math.round(stuckAt + (random() - 0.55) * 3)));
        const progress = Array.from({ length: steps }, (_, step) => {
            if (step < reach - 1) return 1;
            if (step === reach - 1) return Math.round((0.25 + random() * 0.7) * 20) / 20;
            return null;
        });
        return {
            name: `${SURNAMES[(index * 7 + seed) % SURNAMES.length]}${GIVEN[(index * 5 + seed) % GIVEN.length]}`,
            progress,
            lastActive: ["刚刚", "8 分钟前", "1 小时前", "昨天", "3 天前"][Math.floor(random() * 5)],
        };
    });
}

function makeClass(id: string, name: string, slug: string, seed: number, count: number, stuck: number, schedule: TeachClass["schedule"]): TeachClass {
    const course = courseBySlug(slug);
    if (!course) throw new Error(`未知课程 ${slug}`);
    return { id, name, course, students: makeStudents(seed, count, course.lessons.length, stuck), schedule };
}

export const TEACH_CLASSES: readonly TeachClass[] = [
    makeClass("i2301", "室内 2301", "interior", 3, 14, 4, { weekday: "周二", time: "08:30–10:05", room: "设计楼 A402", lessonIndex: 3 }),
    makeClass("i2302", "室内 2302", "interior", 11, 12, 3, { weekday: "周三", time: "14:00–15:35", room: "设计楼 A402", lessonIndex: 2 }),
    makeClass("f2301", "服装 2301", "fashion", 7, 13, 2, { weekday: "周四", time: "10:20–11:55", room: "艺术楼 B210", lessonIndex: 1 }),
];

/** 每一步的平均完成度（没走到的算 0），0..100 */
export function stepAverages(group: TeachClass) {
    return group.course.lessons.map((_, step) => {
        const sum = group.students.reduce((total, student) => total + (student.progress[step] ?? 0), 0);
        return Math.round((sum / group.students.length) * 100);
    });
}

/** 卡点：正在做（已进入但未完成）人数最多的那一步 */
export function stuckStep(group: TeachClass) {
    const doing = group.course.lessons.map((_, step) => group.students.filter((student) => student.progress[step] !== null && (student.progress[step] ?? 0) < 1).length);
    const max = Math.max(...doing);
    return { index: doing.indexOf(max), count: max };
}

/** 整体完成度：所有学生所有步骤的平均，0..100 */
export function overall(group: TeachClass) {
    const averages = stepAverages(group);
    return Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length);
}

/** 近 8 周作业提交率（演示） */
export const SUBMIT_TREND = { labels: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], submitted: [62, 70, 68, 81, 77, 86, 90, 88], onTime: [48, 55, 60, 66, 63, 74, 79, 83] };

/** 本周每天的生成次数（演示） */
export const WEEK_GENERATIONS = [
    { label: "周一", value: 128 },
    { label: "周二", value: 342 },
    { label: "周三", value: 276 },
    { label: "周四", value: 198 },
    { label: "周五", value: 410 },
    { label: "周六", value: 86 },
    { label: "周日", value: 64 },
];
