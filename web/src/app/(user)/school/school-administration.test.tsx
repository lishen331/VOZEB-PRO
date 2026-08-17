import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SchoolCommercialOrder } from "@/lib/school-domain";
import { SchoolCommercialOrderActions } from "./school-administration";

describe("school administration", () => {
    it("uses the tenant API, fixed CSV columns and responsive management surfaces", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-administration.tsx"), "utf8");
        const csvSource = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-csv.ts"), "utf8");
        expect(source).toContain("schoolApi");
        expect(source).not.toContain("fetch(");
        expect(csvSource).toContain('from "papaparse"');
        expect(csvSource).toContain('["username", "displayName", "password", "role"]');
        expect(source).toContain("学校资料");
        expect(source).toContain("成员管理");
        expect(source).toContain("班级管理");
        expect(source).toContain("课程安排");
        expect(source).toContain("商单");
        expect(source).toContain("commercialOrdersApi.listSchoolCommercialOrders");
        expect(source).toContain("commercialOrdersApi.configureCommercialOrder");
        expect(source).toContain("commercialOrdersApi.startCommercialOrder");
        expect(source).toContain("commercialOrdersApi.listCommercialOrderSubmissions");
        expect(source).toContain("const current = await commercialOrdersApi.listCommercialOrderSubmissions(commercialOrder.id, { page: 1, pageSize: 100 })");
        expect(source).not.toContain("viewing?.id === commercialOrder.id ? submissions?.participants.items");
        expect(source).toContain("commercialOrderRequestSequence");
        expect(source).toContain("participantMembershipIds");
        expect(source).toContain('role: "teacher", status: "active"');
        expect(source).toContain('role: "student", status: "active"');
        expect(source).toContain('status: "active", keyword');
        expect(source).toContain('commercialOrder.status === "assigned"');
        expect(source).toContain('size="min(640px, 100vw)"');
        expect(source).not.toContain("internalAmountCents");
        expect(source).toContain("coursesApi.listSchoolCourses");
        expect(source).toContain("coursesApi.listCourseOfferings");
        expect(source).toContain("current={offeringPage}");
        expect(source).toContain("total={offeringTotal}");
        expect(source).toContain("offeringRequestSequence");
        expect(source).toContain("filterOption={false}");
        expect(source).toContain("offering.courseTitle");
        expect(source).toContain("offering.className");
        expect(source).not.toContain("shortId(offering");
        expect(source).not.toContain("while (true)");
        expect(source).toContain("coursesApi.createCourseOffering");
        expect(source).toContain("平台课程内容只读");
        expect(source).toContain("课程已停用，不能创建新的教学安排");
        expect(source).toContain('size="min(640px, 100vw)"');
        expect(source).toContain("afterOpenChange");
        expect(source).toContain("课程附件");
        expect(source).not.toContain('<Drawer\n                title={editing?.name || "班级详情"}\n                open={Boolean(editing)}\n                destroyOnHidden\n                width=');
        expect(source).not.toContain("typeof window");
        expect(source).not.toContain("forceRender");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
        expect(source).not.toContain("教学进度");
        expect(source).not.toContain("结算");
    });

    it("enforces school manager access on the server page", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/page.tsx"), "utf8");
        expect(source).toContain("requireSchoolManager");
        expect(source).toContain('redirect("/create")');
    });

    it("removes all commercial order write actions from terminal states", () => {
        const order: SchoolCommercialOrder = {
            id: "order-a",
            title: "品牌短片",
            requirements: "",
            referenceMaterials: [],
            acceptanceCriteria: "",
            assignedSchoolId: "school-a",
            status: "accepted",
            platformFeedback: "",
            createdAt: "2026-08-17T00:00:00.000Z",
            updatedAt: "2026-08-17T00:00:00.000Z",
        };
        const accepted = renderToStaticMarkup(<SchoolCommercialOrderActions commercialOrder={order} onView={() => undefined} onConfigure={() => undefined} onStart={() => undefined} />);
        const cancelled = renderToStaticMarkup(<SchoolCommercialOrderActions commercialOrder={{ ...order, status: "cancelled" }} onView={() => undefined} onConfigure={() => undefined} onStart={() => undefined} />);
        const assigned = renderToStaticMarkup(<SchoolCommercialOrderActions commercialOrder={{ ...order, status: "assigned" }} onView={() => undefined} onConfigure={() => undefined} onStart={() => undefined} />);

        expect(accepted).toContain("详情");
        expect(accepted).not.toContain("配置团队");
        expect(accepted).not.toContain("开始制作");
        expect(cancelled).not.toContain("配置团队");
        expect(cancelled).not.toContain("开始制作");
        expect(assigned).toContain("配置团队");
        expect(assigned).toContain("开始制作");
    });
});
