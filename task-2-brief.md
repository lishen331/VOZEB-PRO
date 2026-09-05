### Task 2: 剧本导入编码修复与拖拽导入

**Files:**
- Create: `web/src/lib/drama-novel-text-decoder.ts`
- Create: `web/src/lib/drama-novel-text-decoder.test.ts`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.tsx`
- Modify: `web/src/app/(user)/drama-lab/[id]/drama-lab-novel-import.test.tsx` (create if absent)
- Modify: `web/src/app/api/drama-lab/projects/[id]/import-novel/route.test.ts` only for decoding/contract regression coverage that belongs at the API boundary.

**Interfaces:**
- `decodeDramaNovelBytes(bytes: ArrayBuffer): { text: string; encoding: "utf-8" | "utf-16le" | "utf-16be" | "gb18030" }` detects UTF-8/UTF-16 BOMs, validates UTF-8 without replacement, then falls back to GB18030 for legacy Chinese TXT/MD files.
- `DramaLabNovelImport` sends selected and dropped files through the same `readSource(file)` path, validates extension and 2MB before decode, resets the input after processing, and keeps preview/confirm behavior unchanged.

- [ ] **Step 1: Write failing decoder tests** for UTF-8 BOM, UTF-16LE/BE BOM, valid UTF-8 without BOM, GB18030 Chinese bytes, malformed UTF-8 fallback, and the existing 2MB/extension rules.
- [ ] **Step 2: Run the decoder tests and confirm they fail** because `File.text()` currently assumes UTF-8.
- [ ] **Step 3: Implement byte-based decoding** using `ArrayBuffer`, BOM detection, fatal UTF-8 decoding, and `TextDecoder("gb18030")` fallback with a clear error when no supported decoder exists.
- [ ] **Step 4: Run decoder tests and confirm they pass.**
- [ ] **Step 5: Write failing component tests** for drag-over/drop state, accepted `.txt`/`.md` drop, rejected file feedback, and reuse of the same preview request as file selection.
- [ ] **Step 6: Add an accessible drop zone** around the “导入小说” control with keyboard/file-picker fallback, `preventDefault` drag handlers, visual drag state, and no changes to preview confirmation or server import semantics.
- [ ] **Step 7: Run component/API import tests, typecheck, lint and `git diff --check`.**
- [ ] **Step 8: Commit only the decoder/import files** with message `fix(drama-lab): decode legacy scripts and support drag import`.

