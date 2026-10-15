// The database and configuration export (Settings_Integrations_Plan.md 7). The list of tables is
// decided in the database (backup_table_list): this builds the file from the pages that
// function hands out. Pure apart from compression: no network, no secret. The file is JSON, gzipped,
// with a header that says what it is, when, by whom, how many rows of each table, and what is
// deliberately not in it.
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { BACKUP_EXCLUDED } from '../integrations/rules.ts';

export const BACKUP_FORMAT = 'comms-hub-backup';
export const BACKUP_VERSION = 1;
/** Rows above which the export is refused: the server builds it in memory, and the provider's own backups are the tool beyond that. */
export const MAX_ROWS = 300_000;
export const PAGE = 500;

/** What is never in an export, and why: the privacy rule of the product (AGENTS.md). */
export const EXCLUDED = BACKUP_EXCLUDED;

export type TablePlan = { table: string; rows: number };
export type ExportDeps = {
  plan: TablePlan[];
  page: (table: string, offset: number, limit: number) => Promise<unknown[]>;
};
export type ExportMeta = { kind: 'database' | 'config'; takenAt: string; takenBy: string; run: string };
export type BuiltExport = { bytes: Uint8Array; sha256: string; items: number; tables: Record<string, number> };

export class ExportTooLarge extends Error {
  constructor() {
    super('BACKUP_TOO_LARGE');
  }
}

export async function buildExport(meta: ExportMeta, deps: ExportDeps, maxRows = MAX_ROWS): Promise<BuiltExport> {
  const total = deps.plan.reduce((n, t) => n + t.rows, 0);
  if (total > maxRows) throw new ExportTooLarge();
  const parts: string[] = [];
  const counts: Record<string, number> = {};
  parts.push(
    `{"format":${JSON.stringify(BACKUP_FORMAT)},"version":${BACKUP_VERSION},"kind":${JSON.stringify(meta.kind)},"run":${JSON.stringify(meta.run)},` +
      `"taken_at":${JSON.stringify(meta.takenAt)},"taken_by":${JSON.stringify(meta.takenBy)},"excluded":${JSON.stringify(EXCLUDED)},"tables":{`,
  );
  let first = true;
  for (const t of deps.plan) {
    parts.push(`${first ? '' : ','}${JSON.stringify(t.table)}:[`);
    first = false;
    let got = 0;
    for (let offset = 0; offset < t.rows; offset += PAGE) {
      const rows = await deps.page(t.table, offset, PAGE);
      if (!rows.length) break;
      for (const r of rows) parts.push(`${got ? ',' : ''}${JSON.stringify(r)}`), got++;
    }
    parts.push(']');
    counts[t.table] = got;
  }
  parts.push(`},"counts":${JSON.stringify(counts)}}`);
  const bytes = gzipSync(Buffer.from(parts.join(''), 'utf8'));
  return {
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    items: Object.values(counts).reduce((a, b) => a + b, 0),
    tables: counts,
  };
}

/** A readable file name for the download. */
export const exportFileName = (kind: 'database' | 'config', takenAt: string) =>
  `comms-hub-${kind === 'database' ? 'records' : 'settings'}-${takenAt.slice(0, 10)}.json.gz`;
