import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {demand} from './model.mjs';

const fingerprint = payload => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

// A persistent single-machine journal, not provider-side idempotency. Keep this
// folder across downloads. Moving to another PC requires copying the journal
// and checking Minimax first. A stale crash lock deliberately fails closed.
export function openJournal(directory) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700});
  const lock = path.join(directory, 'probe.lock');
  const file = path.join(directory, 'probe-001.json');
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx', 0o600); }
  catch { throw new Error('PROBE_LOCKED_CHECK_PREVIOUS_ATTEMPT'); }
  try { fs.writeFileSync(descriptor, String(process.pid)); fs.fsyncSync(descriptor); }
  catch (e) { fs.closeSync(descriptor); throw e; }
  fs.closeSync(descriptor);
  return {
    read() {
      if (!fs.existsSync(file)) return null;
      const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
      demand(entry.schema === 1 && entry.fingerprint === fingerprint(entry.payload) &&
        ['prepared', 'sending', 'created', 'verified'].includes(entry.status), 'JOURNAL_INVALID');
      if (['created', 'verified'].includes(entry.status)) demand(Number.isSafeInteger(entry.invoiceId) && entry.invoiceId > 0, 'JOURNAL_INVALID');
      return entry;
    },
    write(entry) {
      const record = {...entry, schema: 1, fingerprint: fingerprint(entry.payload)};
      const temp = path.join(directory, `write-${randomUUID()}.tmp`);
      const fd = fs.openSync(temp, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(record, null, 2)); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      fs.renameSync(temp, file);
      // Windows doesn't support directory fsync. File fsync + atomic rename
      // still protects process crashes; no claim of protection from disk loss.
      if (process.platform !== 'win32') {
        const dirfd = fs.openSync(directory, 'r');
        try { fs.fsyncSync(dirfd); } finally { fs.closeSync(dirfd); }
      }
    },
    close() { fs.unlinkSync(lock); },
  };
}
