/**
 * Scan and optionally remove invalid/orphan file records (not real user accounts).
 *
 * Usage (from app/):
 *   pnpm demo:cleanup-files              # dry-run (default)
 *   CONFIRM_CLEAN_DEMO_FILES=true pnpm demo:cleanup-files
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { cleanupInvalidFiles, scanInvalidFiles } from '../src/server/files/cleanup';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const confirm = process.env.CONFIRM_CLEAN_DEMO_FILES === 'true';
const dryRun = !confirm;

async function main() {
  console.log(dryRun ? 'DRY RUN — no data will be deleted\n' : 'LIVE RUN — invalid files will be deleted\n');

  const scan = await scanInvalidFiles({ includeTrash: true, checkStorage: true });
  console.log(`Scanned ${scan.scanned} file records. Found ${scan.invalid.length} invalid:\n`);

  if (scan.invalid.length === 0) {
    console.log('Nothing to clean up.');
    return;
  }

  for (const row of scan.invalid) {
    console.log(
      `  - ${row.name} (${row.fileId.slice(0, 8)}…) reason=${row.reason} trash=${row.deletedAt ? 'yes' : 'no'} size=${row.sizeBytes ?? '—'}`,
    );
  }

  if (dryRun) {
    console.log('\nTo delete these records and related storage objects, run:');
    console.log('  CONFIRM_CLEAN_DEMO_FILES=true pnpm demo:cleanup-files');
    return;
  }

  const result = await cleanupInvalidFiles(false);
  console.log('\nCleanup complete:');
  console.log(`  Files removed: ${result.deletedFiles}`);
  console.log(`  Versions removed: ${result.deletedVersions}`);
  console.log(`  Favorites removed: ${result.deletedFavorites}`);
  console.log(`  Storage deletes attempted: ${result.storageDeletesAttempted}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
