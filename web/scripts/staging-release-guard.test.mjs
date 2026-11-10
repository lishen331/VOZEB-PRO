import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
const script = resolve("scripts/staging-release-guard.sh");
const gitBash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
test("shared staging accepts only latest develop and preserves its deployed history", () => {
    const dir = mkdtempSync(join(tmpdir(), "vozeb-staging-guard-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    try {
        git("init", "-q");
        git("config", "user.name", "Fixture");
        git("config", "user.email", "fixture@example.invalid");
        writeFileSync(join(dir, "fixture.txt"), "base");
        git("add", ".");
        git("commit", "-qm", "base");
        const old = git("rev-parse", "HEAD");
        writeFileSync(join(dir, "fixture.txt"), "develop");
        git("add", ".");
        git("commit", "-qm", "develop");
        const candidate = git("rev-parse", "HEAD");
        const check = (patch) =>
            spawnSync(gitBash, [script.replaceAll("\\", "/")], {
                cwd: dir,
                encoding: "utf8",
                env: { ...process.env, RELEASE_REF: "refs/heads/develop", CANDIDATE_SHA: candidate, DEVELOP_SHA: candidate, DEPLOYED_IMAGE: `ghcr.io/lishen331/vozeb-pro:sha-${old}`, ...patch },
            });
        const allowed = check({});
        assert.equal(allowed.status, 0, allowed.stderr);
        assert.notEqual(check({ RELEASE_REF: "refs/heads/fix/production-candidate" }).status, 0);
        assert.notEqual(check({ DEVELOP_SHA: old }).status, 0);
        assert.notEqual(check({ DEPLOYED_IMAGE: "ghcr.io/lishen331/vozeb-pro:latest" }).status, 0);
        assert.notEqual(check({ CANDIDATE_SHA: old, DEVELOP_SHA: old, DEPLOYED_IMAGE: `ghcr.io/lishen331/vozeb-pro:sha-${candidate}` }).status, 0);
        assert.notEqual(check({ DEPLOYED_IMAGE: `ghcr.io/unrelated/project:sha-${old}` }).status, 0);
        const workflow = readFileSync(resolve(script, "../../../.github/workflows/staging-image.yml"), "utf8");
        assert.match(workflow, /Validate shared staging baseline/);
        assert.match(workflow, /RELEASE_REF: \$\{\{ github.ref \}\}/);
        assert.match(workflow, /DEPLOYED_IMAGE/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
