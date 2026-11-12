import { test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const script = resolve("scripts/staging-release-guard.sh");
const gitBash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
let dir, old, candidate;
beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "vozeb-staging-guard-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git("init", "-q");
    git("config", "user.name", "Fixture");
    git("config", "user.email", "fixture@example.invalid");
    writeFileSync(join(dir, "fixture.txt"), "base");
    git("add", ".");
    git("commit", "-qm", "base");
    old = git("rev-parse", "HEAD");
    writeFileSync(join(dir, "fixture.txt"), "develop");
    git("add", ".");
    git("commit", "-qm", "develop");
    candidate = git("rev-parse", "HEAD");
});
afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
});
function check(patch = {}) {
    return spawnSync(gitBash, [script.replaceAll("\\", "/")], {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, RELEASE_REF: "refs/heads/develop", CANDIDATE_SHA: candidate, DEVELOP_SHA: candidate, DEPLOYED_IMAGE: `ghcr.io/lishen331/vozeb-pro:sha-${old}`, ...patch },
    });
}
test("accepts latest develop preserving the deployed history", () => {
    const result = check();
    assert.equal(result.status, 0, result.stderr);
});
test("rejects a production candidate branch on shared staging", () => {
    assert.notEqual(check({ RELEASE_REF: "refs/heads/fix/production-candidate" }).status, 0);
});
test("rejects a candidate older than latest develop", () => {
    assert.notEqual(check({ DEVELOP_SHA: old }).status, 0);
});
test("rejects a floating image identity", () => {
    assert.notEqual(check({ DEPLOYED_IMAGE: "ghcr.io/lishen331/vozeb-pro:latest" }).status, 0);
});
test("rejects discarding the currently deployed history", () => {
    assert.notEqual(check({ CANDIDATE_SHA: old, DEVELOP_SHA: old, DEPLOYED_IMAGE: `ghcr.io/lishen331/vozeb-pro:sha-${candidate}` }).status, 0);
});
test("rejects an unrelated image repository", () => {
    assert.notEqual(check({ DEPLOYED_IMAGE: `ghcr.io/unrelated/project:sha-${old}` }).status, 0);
});
test("workflow checks ref and deployed baseline before shared staging changes", () => {
    const workflow = readFileSync(resolve(script, "../../../.github/workflows/staging-image.yml"), "utf8");
    assert.match(workflow, /Validate shared staging baseline/);
    assert.match(workflow, /RELEASE_REF: \$\{\{ github.ref \}\}/);
    assert.match(workflow, /DEPLOYED_IMAGE/);
});
