# Development Map Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the interface index and development map part of the mandatory pull/push workflow and keep their generated facts aligned with the current source tree.

**Architecture:** Keep semantic documentation in the two existing Markdown files. Add one PowerShell update entry point that refreshes route/page/table inventories and regenerates the interface index, then updates the development map's generated baseline line. Add a separate validation script that checks counts, referenced handler files, UTF-8 decoding, and common mojibake markers. Record both commands in `AGENTS.md` and `VOZEB-PRO-更新部署流程.md`; no local Git hooks are introduced.

**Tech Stack:** PowerShell 7-compatible scripts, UTF-8 Markdown, existing route inventory and interface-index generator.

## Global Constraints

- Preserve all existing uncommitted user changes; only touch the documented sync workflow and the two requested maps.
- Keep Chinese source, scripts, and documents encoded as UTF-8.
- Do not regenerate or overwrite application data under `output/`.
- Do not claim the maps are synchronized until the update and validation commands both exit successfully.

---

### Task 1: Add the shared map update and validation commands

**Files:**
- Create: `过程文件/更新开发地图.ps1`
- Create: `过程文件/验证开发文档.ps1`
- Modify: `过程文件/生成接口索引.ps1`

**Interfaces:**
- `更新开发地图.ps1` runs from any repository working directory and accepts no required arguments.
- `验证开发文档.ps1` runs from any repository working directory and accepts no required arguments; non-zero exit means the maps cannot be pushed.

- [ ] **Step 1: Make the interface generator use the current date instead of a hard-coded date.**

- [ ] **Step 2: Implement `更新开发地图.ps1` to run the existing inventory generator, regenerate `VOZEB-PRO-接口索引.md`, and replace the generated baseline line in `VOZEB-PRO-开发地图.md` with current date and counts from the inventories.**

- [ ] **Step 3: Implement `验证开发文档.ps1` to verify the inventory counts in both Markdown files, every indexed Handler exists, no duplicate indexed route path exists, and both Markdown files decode as UTF-8 without `�` or `锟斤拷`.**

- [ ] **Step 4: Run both scripts from the repository root and confirm successful output.**

### Task 2: Refresh the two development maps

**Files:**
- Modify: `VOZEB-PRO-接口索引.md`
- Modify: `VOZEB-PRO-开发地图.md`

- [ ] **Step 1: Refresh generated counts and date through `过程文件/更新开发地图.ps1`.**

- [ ] **Step 2: Correct stale maintenance references and add the rule that interface, page, service, database, and deployment changes must be documented in the same commit.**

- [ ] **Step 3: Run `过程文件/验证开发文档.ps1` and inspect the diff for unrelated changes.**

### Task 3: Make pull/push documentation synchronization mandatory

**Files:**
- Modify: `AGENTS.md`
- Modify: `VOZEB-PRO-更新部署流程.md`

- [ ] **Step 1: Add a collaboration gate requiring the update and validation scripts after pull/fetch integration and before every push.**

- [ ] **Step 2: Add the exact PowerShell commands and the rule to preserve uncommitted user changes.**

- [ ] **Step 3: Run the validation script and `git diff --check`.**

### Task 4: Final verification

**Files:**
- Verify: `VOZEB-PRO-接口索引.md`
- Verify: `VOZEB-PRO-开发地图.md`
- Verify: `AGENTS.md`
- Verify: `VOZEB-PRO-更新部署流程.md`

- [ ] **Step 1: Run `过程文件/更新开发地图.ps1` once more to prove repeatability.**

- [ ] **Step 2: Run `过程文件/验证开发文档.ps1`, `git diff --check`, and a UTF-8/mojibake scan.**

- [ ] **Step 3: Confirm `git status` shows only intended documentation/process files plus pre-existing user changes.**
