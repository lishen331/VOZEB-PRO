# Unified Education Login Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the confirmed unified education login page, role-aware safe redirects, public/admin login-page settings, deployable default media, and independent login navigation.

**Architecture:** Extend the existing `site` settings contract with a normalized `loginPage` object and expose only that allowlisted object through the public session. Keep authentication and MFA in `AuthForm`, adding a dedicated login presentation while preserving register/install presentations. Route all homepage authentication intents to `/login?next=...` and serve uploaded login assets from a dedicated public media endpoint.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Ant Design 6, Tailwind CSS, Vitest, Playwright, ffmpeg/sharp.

## Global Constraints

- Do not touch or revert unrelated existing worktree changes.
- Preserve login rate limiting, audit logging, account checks, and administrator MFA.
- Accept only safe same-site paths or HTTPS URLs for login media; never desktop absolute paths or arbitrary data URLs.
- Use the provided video and brand assets only as deployable generated defaults.
- Login remains usable when media or public configuration fails.

---

### Task 1: Login settings and safe navigation contract

**Files:**
- Modify: `web/src/lib/auth/store-types.ts`
- Modify: `web/src/lib/auth/store-foundation.ts`
- Modify: `web/src/lib/auth/store-normalizers.ts`
- Modify: `web/src/lib/auth/session.ts`
- Modify: `web/src/stores/use-public-session-store.ts`
- Create: `web/src/lib/login-navigation.ts`
- Test: `web/src/lib/auth/site-settings.test.ts`
- Test: `web/src/lib/auth/session.test.ts`
- Test: `web/src/lib/login-navigation.test.ts`

- [ ] Write tests for defaults, normalization, public allowlisting, safe `next`, and admin/user default destinations.
- [ ] Run focused tests and confirm expected failures.
- [ ] Add the minimal typed settings and navigation implementation.
- [ ] Run focused tests and typecheck.

### Task 2: Deployable default media and dedicated login page

**Files:**
- Create: `web/public/login/hero.mp4`
- Create: `web/public/login/hero-poster.webp`
- Create: `web/public/login/joint-brand.webp`
- Modify: `web/src/app/login/page.tsx`
- Modify: `web/src/components/auth/auth-form.tsx`
- Modify: `web/src/app/styles/global-auth.css`
- Test: `web/src/components/auth/login-page-contract.test.ts`

- [ ] Write a failing contract test for full-screen split layout, media fallback, policy checkbox, MFA, registration visibility, and no CAPTCHA/home link.
- [ ] Run the test and confirm expected failures.
- [ ] Generate compatible media and implement the dedicated light-brand login presentation.
- [ ] Run focused tests, typecheck, and visual browser checks at desktop/390/430 plus reduced motion and broken video.

### Task 3: Homepage routing and administrator configuration

**Files:**
- Modify: `web/src/app/home/home-actions.tsx`
- Modify: `web/src/components/admin/admin-configuration-sections.tsx`
- Modify: `web/src/components/admin/use-admin-dashboard-settings-actions.tsx`
- Modify: `web/src/components/admin/use-admin-dashboard-state.tsx`
- Modify: `web/src/components/admin/admin-dashboard.tsx`
- Create: `web/src/app/api/admin/login-page-media/route.ts`
- Create: `web/src/app/api/login-page-media/[fileName]/route.ts`
- Create: `web/src/lib/server/login-page-media.ts`
- Test: `web/src/app/home/home-actions.test.ts`
- Test: `web/src/app/api/admin/login-page-media/route.test.ts`
- Test: `web/src/app/api/login-page-media/[fileName]/route.test.ts`
- Test: `web/src/app/api/admin/settings/route.test.ts`

- [ ] Write failing tests for independent login routing and media authorization/type/size behavior.
- [ ] Run tests and confirm expected failures.
- [ ] Remove the homepage login Modal; add responsive admin fields, previews, and upload actions.
- [ ] Implement authenticated uploads and public safe media reads.
- [ ] Run focused tests and typecheck.

### Task 4: Regression and release gates

**Files:**
- Modify only if structural indexes require it: `VOZEB-PRO-接口索引.md`, `VOZEB-PRO-开发地图.md`
- Add/update browser test only where needed for stable login regression.

- [ ] Run relevant Vitest suites and browser regression.
- [ ] Run full lint, typecheck, tests, build, strict UTF-8/mojibake scan, and documentation validation.
- [ ] Review `git diff`/`git status` and report unrelated pre-existing changes separately.
