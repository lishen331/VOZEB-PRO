import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const result = await pool.query("SELECT to_regclass($1)::text AS old_ai, to_regclass($2)::text AS new_ai, to_regclass($3)::text AS new_prompt, to_regclass($4)::text AS new_scenario, to_regclass($5)::text AS new_generation, to_regclass($6)::text AS new_sd2", ["public.drama_lab_ai_configs", "public.vozeb_pro_drama_lab_ai_configs", "public.vozeb_pro_drama_lab_prompt_templates", "public.vozeb_pro_drama_lab_business_scenarios", "public.vozeb_pro_drama_lab_generation_settings", "public.vozeb_pro_drama_lab_sd2_assets"]);
console.log(result.rows[0]);
await pool.end();
