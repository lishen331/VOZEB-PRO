import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { initializePostgresSchema, postgresQuery } from "./database";
import { attachReversePromptHistory, getReversePromptHistory, listReversePromptHistory } from "./practice-reverse-prompt-history-store";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;

postgresIt(
    "persists successful analysis and paired trial independently of task lifetime or response order",
    async () => {
        await initializePostgresSchema();
        const userId = randomUUID();
        const schoolId = randomUUID();
        const scope = { userId, schoolId };
        const analysisId = randomUUID();
        const oldTrialId = randomUUID();
        const newerTrialId = randomUUID();
        const newestTrialId = randomUUID();
        const sourceKey = `permanent/source-${userId}.png`;
        const image = `permanent/result-${userId}.png`;
        const imageUrl = `/api/generation-log-assets/${image}`;
        const time = new Date("2026-11-26T00:00:00Z").valueOf();
        const insertTask = (id: string, type: string, status: string, payload: unknown, offset: number) =>
            postgresQuery(
                `INSERT INTO generation_tasks (id,user_id,school_id,task_type,status,payload,created_at,updated_at,expires_at,execution_profile)
            VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7,now()+interval '1 day','open-source-practice')`,
                [id, userId, schoolId, type, status, JSON.stringify(payload), new Date(time + offset)],
            );
        const completeImage = (id: string, value: string) => postgresQuery("UPDATE generation_tasks SET status = 'success', payload = payload || $2::jsonb WHERE id = $1", [id, JSON.stringify({ result: { serverUrl: value, width: 800, height: 1200 } })]);
        await postgresQuery("INSERT INTO users (id,username,display_name,password_hash) VALUES ($1,$1,$1,'fixture')", [userId]);
        try {
            await postgresQuery(
                `INSERT INTO local_media_assets (storage_key, scope, storage_class, type, owner_user_id, mime_type, bytes)
            VALUES ($1,'reference','permanent','image',$3,'image/png',42),($2,'generation','permanent','image',$3,'image/png',42)`,
                [sourceKey, image, userId],
            );
            await insertTask(analysisId, "text", "success", { result: { content: "structured analysis" } }, 0);
            const settings = { sourceKey, mode: "style", extraRequirement: "lighting" };
            await attachReversePromptHistory(scope, analysisId, settings);
            await attachReversePromptHistory(scope, analysisId, { ...settings, mode: "detail" });
            expect((await listReversePromptHistory(scope, null)).records).toHaveLength(1);
            expect(await getReversePromptHistory(scope, analysisId)).toMatchObject({ analysisText: "structured analysis", analysisMode: "style", extraRequirement: "lighting" });
            expect(await getReversePromptHistory({ ...scope, schoolId: "other" }, analysisId)).toBeNull();
            expect(await getReversePromptHistory({ ...scope, userId: "other" }, analysisId)).toBeNull();
            await insertTask(oldTrialId, "image", "pending", { prompt: "old prompt" }, 1);
            await attachReversePromptHistory(scope, oldTrialId, { historyId: analysisId });
            await insertTask(newerTrialId, "image", "pending", { prompt: "newer prompt" }, 2);
            await attachReversePromptHistory(scope, newerTrialId, { historyId: analysisId });
            await completeImage(newerTrialId, "data:image/png;base64,dGVzdA==");
            expect(await getReversePromptHistory(scope, analysisId)).toMatchObject({ trialStatus: "success" });
            expect((await getReversePromptHistory(scope, analysisId))?.trial).toBeUndefined();
            await completeImage(newerTrialId, imageUrl);
            await completeImage(oldTrialId, imageUrl);
            await insertTask(newestTrialId, "image", "pending", { prompt: "failed prompt" }, 3);
            await attachReversePromptHistory(scope, newestTrialId, { historyId: analysisId });
            await postgresQuery("UPDATE generation_tasks SET status='error' WHERE id=$1", [newestTrialId]);
            await postgresQuery("DELETE FROM generation_tasks WHERE user_id = $1", [userId]);
            expect(await getReversePromptHistory(scope, analysisId)).toMatchObject({ trialStatus: "failed", trial: { taskId: newerTrialId, prompt: "newer prompt", image: { url: imageUrl, width: 800, height: 1200 } } });
        } finally {
            await postgresQuery("DELETE FROM users WHERE id = $1", [userId]);
        }
    },
    20_000,
);
