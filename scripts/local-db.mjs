import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync(".sites-runtime", { recursive: true });
writeFileSync(".sites-runtime/wrangler-local.json", JSON.stringify({
  name: "tibo-reset-local", main: "../build/sites-worker.ts", compatibility_date: "2026-05-15",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: "../drizzle" }],
}, null, 2));
const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "migrations", "apply", "DB", "--local", "--config", ".sites-runtime/wrangler-local.json", "--persist-to", ".wrangler/state"], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
