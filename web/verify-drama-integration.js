/**
 * 验证短剧管理模块是否正确集成
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log("🔍 验证短剧管理模块集成...\n");

const checks = [];

// 1. 检查 admin-sections.ts
const sectionsPath = path.join(__dirname, "src/components/admin/admin-sections.ts");
const sectionsContent = fs.readFileSync(sectionsPath, "utf-8");
checks.push({
    name: "admin-sections.ts 包含 dramaProjects key",
    pass: sectionsContent.includes('"dramaProjects"'),
});
checks.push({
    name: "admin-sections.ts 包含 dramaProjects 权限",
    pass: /dramaProjects:\s*\["content\.manage"\]/.test(sectionsContent),
});

// 2. 检查 admin-section-nav.tsx
const navPath = path.join(__dirname, "src/components/admin/admin-section-nav.tsx");
const navContent = fs.readFileSync(navPath, "utf-8");
checks.push({
    name: "admin-section-nav.tsx 导入 Clapperboard 图标",
    pass: navContent.includes("Clapperboard"),
});
checks.push({
    name: "admin-section-nav.tsx 包含短剧管理导航项",
    pass: navContent.includes('key: "dramaProjects"') && navContent.includes('label: "短剧管理"'),
});
checks.push({
    name: "admin-section-nav.tsx 包含短剧管理分组",
    pass: navContent.includes('title: "短剧管理"') && navContent.includes('sectionsFor(["dramaProjects"])'),
});

// 3. 检查 admin-dashboard.tsx
const dashboardPath = path.join(__dirname, "src/components/admin/admin-dashboard.tsx");
const dashboardContent = fs.readFileSync(dashboardPath, "utf-8");
checks.push({
    name: "admin-dashboard.tsx 包含 loadDramaProjectsSection",
    pass: dashboardContent.includes("loadDramaProjectsSection"),
});
checks.push({
    name: "admin-dashboard.tsx 包含 AdminDramaProjectsSection 组件",
    pass: dashboardContent.includes("AdminDramaProjectsSection"),
});
checks.push({
    name: "admin-dashboard.tsx 包含条件渲染",
    pass: /activeSection === "dramaProjects"/.test(dashboardContent),
});

// 4. 检查页面文件是否存在
const pagePath = path.join(__dirname, "src/app/admin/drama-projects/page.tsx");
checks.push({
    name: "drama-projects/page.tsx 文件存在",
    pass: fs.existsSync(pagePath),
});

// 5. 检查 API 文件是否存在
const apiPath = path.join(__dirname, "src/app/api/admin/drama-projects/route.ts");
const apiIdPath = path.join(__dirname, "src/app/api/admin/drama-projects/[id]/route.ts");
checks.push({
    name: "api/admin/drama-projects/route.ts 存在",
    pass: fs.existsSync(apiPath),
});
checks.push({
    name: "api/admin/drama-projects/[id]/route.ts 存在",
    pass: fs.existsSync(apiIdPath),
});

// 输出结果
let allPassed = true;
checks.forEach((check, index) => {
    const icon = check.pass ? "✅" : "❌";
    console.log(`${icon} ${index + 1}. ${check.name}`);
    if (!check.pass) allPassed = false;
});

console.log("\n" + "=".repeat(60));
if (allPassed) {
    console.log("✅ 所有检查通过！短剧管理模块已正确集成。");
    console.log("\n📝 下一步：");
    console.log("1. 重启开发服务器：npm run dev");
    console.log("2. 清除浏览器缓存：Ctrl+Shift+R");
    console.log("3. 访问：http://localhost:3002/admin");
    console.log('4. 在左侧导航找到"短剧管理"分类');
} else {
    console.log("❌ 有检查项未通过，请检查上述失败项。");
}
console.log("=".repeat(60));
