import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SESSIONS_DIR = join(homedir(), '.codex', 'sessions');
const POLL_MS = 500;
const INITIAL_TAIL_BYTES = 64 * 1024;
const MAX_CARRY_CHARS = 4096;

export interface ContextCompactionMonitorOptions {
  sessionId: string;
  sinceMs: number;
  signal: AbortSignal;
  onCompacted: () => void;
  sessionsDir?: string;
  pollMs?: number;
}

/**
 * Watch the active Codex rollout for context_compacted events.
 *
 * `codex exec --json` currently filters this lifecycle event out on some
 * releases, even though Codex writes it to the session rollout. Tailing only
 * the active session bridges that observability gap without changing when or
 * how Codex performs compaction.
 */
export async function monitorContextCompactions(
  opts: ContextCompactionMonitorOptions,
): Promise<void> {
  const root = opts.sessionsDir ?? DEFAULT_SESSIONS_DIR;
  const pollMs = opts.pollMs ?? POLL_MS;
  let path: string | undefined;

  while (!opts.signal.aborted && !path) {
    path = await findSessionRollout(root, opts.sessionId);
    if (!path) await abortableDelay(pollMs, opts.signal);
  }
  if (!path || opts.signal.aborted) return;

  let cursor = 0;
  try {
    const initial = await stat(path);
    // A resumed rollout can be very large. Its final 64 KiB is enough to
    // catch a compaction that raced file discovery, while timestamps below
    // prevent old events from surfacing in the new run.
    cursor = Math.max(0, initial.size - INITIAL_TAIL_BYTES);
  } catch {
    return;
  }

  let carry = '';
  let lastTimestamp = -1;
  while (!opts.signal.aborted) {
    try {
      const current = await stat(path);
      if (current.size < cursor) {
        cursor = 0;
        carry = '';
      }
      if (current.size > cursor) {
        const bytes = current.size - cursor;
        const buffer = Buffer.allocUnsafe(bytes);
        const file = await open(path, 'r');
        try {
          const { bytesRead } = await file.read(buffer, 0, bytes, cursor);
          cursor += bytesRead;
          const lines = `${carry}${buffer.subarray(0, bytesRead).toString('utf8')}`.split('\n');
          carry = lines.pop()?.slice(-MAX_CARRY_CHARS) ?? '';
          for (const line of lines) {
            const timestamp = contextCompactionTimestamp(line);
            if (timestamp === undefined || timestamp < opts.sinceMs) continue;
            if (timestamp <= lastTimestamp) continue;
            lastTimestamp = timestamp;
            opts.onCompacted();
          }
        } finally {
          await file.close();
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    await abortableDelay(pollMs, opts.signal);
  }
}

export function contextCompactionTimestamp(line: string): number | undefined {
  if (!line.includes('"type":"event_msg"') || !line.includes('"type":"context_compacted"')) {
    return undefined;
  }
  try {
    const record = JSON.parse(line) as {
      timestamp?: unknown;
      type?: unknown;
      payload?: { type?: unknown };
    };
    if (record.type !== 'event_msg' || record.payload?.type !== 'context_compacted') {
      return undefined;
    }
    if (typeof record.timestamp !== 'string') return undefined;
    const timestamp = Date.parse(record.timestamp);
    return Number.isFinite(timestamp) ? timestamp : undefined;
  } catch {
    return undefined;
  }
}

async function findSessionRollout(dir: string, sessionId: string): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.jsonl') && entry.name.includes(sessionId)) {
      return join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findSessionRollout(join(dir, entry.name), sessionId);
    if (found) return found;
  }
  return undefined;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}
