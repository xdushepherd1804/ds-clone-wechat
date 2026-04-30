/**
 * Database Migration Runner
 *
 * Executes SQL migration files against PostgreSQL.
 * Usage:
 *   npx tsx scripts/migrate.ts up          # run all pending migrations
 *   npx tsx scripts/migrate.ts down        # rollback last migration
 *   npx tsx scripts/migrate.ts status      # show migration status
 *
 * Migration files live in ../migrations/ named as:
 *   000001_init.up.sql   / 000001_init.down.sql
 *   000002_xxx.up.sql    / 000002_xxx.down.sql
 *
 * Tracks applied migrations in a `schema_migrations` table.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://wechat:wechat_dev@localhost:5432/wechat';

interface Migration {
  version: string;
  name: string;
  upFile: string;
  downFile: string;
}

function getMigrations(): Migration[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => extname(f) === '.sql');
  const upFiles = new Set(files.filter((f) => f.endsWith('.up.sql')));
  const downFiles = new Set(files.filter((f) => f.endsWith('.down.sql')));

  const migrations: Migration[] = [];
  for (const file of upFiles) {
    const match = file.match(/^(\d+)_(.+)\.up\.sql$/);
    if (!match) continue;
    const [, version, name] = match;
    const downFile = `${version}_${name}.down.sql`;
    if (!downFiles.has(downFile)) {
      console.warn(`⚠  Missing down migration for ${file}, skipping`);
      continue;
    }
    migrations.push({ version, name, upFile: file, downFile });
  }
  migrations.sort((a, b) => a.version.localeCompare(b.version));
  return migrations;
}

async function ensureSchemaMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   VARCHAR(14) PRIMARY KEY,
      name      VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedVersions(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(rows.map((r) => r.version));
}

async function runUp(pool: Pool, migration: Migration): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS_DIR, migration.upFile), 'utf-8');
  console.log(`  ↑ Running ${migration.version}_${migration.name} ...`);
  await pool.query(sql);
  await pool.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
    migration.version,
    migration.name,
  ]);
  console.log(`  ✓ ${migration.version}_${migration.name} applied`);
}

async function runDown(pool: Pool, migration: Migration): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS_DIR, migration.downFile), 'utf-8');
  console.log(`  ↓ Rolling back ${migration.version}_${migration.name} ...`);
  await pool.query(sql);
  await pool.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
  console.log(`  ✓ ${migration.version}_${migration.name} rolled back`);
}

async function main() {
  const command = process.argv[2] || 'status';
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await ensureSchemaMigrationsTable(pool);

    const migrations = getMigrations();
    const applied = await getAppliedVersions(pool);

    if (command === 'status') {
      console.log('\nMigration Status:\n');
      for (const m of migrations) {
        const status = applied.has(m.version) ? '✓ applied' : '○ pending';
        console.log(`  ${m.version}_${m.name}  [${status}]`);
      }
      console.log(`\n${applied.size}/${migrations.length} applied\n`);
      return;
    }

    if (command === 'up') {
      const pending = migrations.filter((m) => !applied.has(m.version));
      if (pending.length === 0) {
        console.log('No pending migrations.');
        return;
      }
      console.log(`\nApplying ${pending.length} migration(s)...\n`);
      for (const m of pending) {
        await runUp(pool, m);
      }
      console.log('\nAll migrations applied.\n');
      return;
    }

    if (command === 'down') {
      const lastApplied = migrations.filter((m) => applied.has(m.version)).at(-1);
      if (!lastApplied) {
        console.log('No migrations to roll back.');
        return;
      }
      console.log(`\nRolling back 1 migration...\n`);
      await runDown(pool, lastApplied);
      console.log('\nRollback complete.\n');
      return;
    }

    console.error(`Unknown command: ${command}. Use: up | down | status`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
