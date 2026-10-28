import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
    ...base,
    projects: base.projects?.map((project) => (project.name === "setup" ? project : { ...project, testMatch: /canvas-media-delivery\.spec\.ts/ })),
});
