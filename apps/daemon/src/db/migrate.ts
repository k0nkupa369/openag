import type { Database } from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function migrate(db: Database, dir: string): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)",
  );
  // 0.6.0 shipped Web Push as 039 while the proactive line also used 039; it is now 044.
  db.transaction(() => {
    db.prepare(
      "UPDATE schema_version SET version = 44, name = '044_web_push.sql' WHERE version = 39 AND name = '039_web_push.sql' AND NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 44)",
    ).run();
  })();
  const applied = new Map(
    (db.prepare("SELECT version, name FROM schema_version").all() as { version: number; name: string }[]).map((r) => [r.version, r.name]),
  );
  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
  const seen = new Map<number, string>();
  for (const file of files) {
    const version = parseInt(file, 10);
    if (seen.has(version)) throw new Error(`Duplicate migration number ${version}: ${seen.get(version)} and ${file}`);
    seen.set(version, file);
  }
  for (const file of files) {
    const version = parseInt(file, 10);
    const appliedName = applied.get(version);
    if (appliedName !== undefined) {
      if (appliedName !== file) throw new Error(`Migration ${version} was applied as ${appliedName}, but the file is ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    const rebuild=sql.startsWith('-- rebuild-with-foreign-keys-off');
    const foreignKeys=db.pragma('foreign_keys',{simple:true});
    if(rebuild)db.pragma('foreign_keys = OFF');
    try { db.transaction(() => {
      db.exec(sql);
      if(rebuild&&(db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Migration would break foreign-key links');
      db.prepare("INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)").run(
        version,
        file,
        Date.now(),
      );
    })(); } finally { if(rebuild)db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`); }
  }
}
