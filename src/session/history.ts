import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

export interface SessionSummary {
  sessionId: string;
  mtime: number;
  preview: string;
  lineCount: number;
}

interface SessionFile {
  path: string;
  mtime: number;
}

const CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions');
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** Return the most recent `limit` Codex jsonl sessions for the given cwd, newest first. */
export async function listRecentSessions(cwd: string, limit = 5): Promise<SessionSummary[]> {
  const files = await listSessionFiles(CODEX_SESSIONS_DIR);
  files.sort((a, b) => b.mtime - a.mtime);

  const out: SessionSummary[] = [];
  for (const file of files) {
    const summary = await summarize(file.path, cwd);
    if (!summary) continue;
    out.push({ ...summary, mtime: file.mtime });
    if (out.length >= limit) break;
  }
  return out;
}

async function listSessionFiles(dir: string): Promise<SessionFile[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return listSessionFiles(path);
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return [];
      try {
        const st = await stat(path);
        return [{ path, mtime: st.mtimeMs }];
      } catch {
        return [];
      }
    }),
  );
  return nested.flat();
}

async function summarize(
  path: string,
  cwd: string,
): Promise<{ sessionId: string; preview: string; lineCount: number } | null> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream });
  let sessionId = sessionIdFromPath(path);
  let sessionCwd: string | undefined;
  let preview = '';
  let lineCount = 0;

  try {
    for await (const line of rl) {
      lineCount++;
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const meta = readSessionMeta(obj);
        if (meta) {
          sessionId = meta.id ?? sessionId;
          sessionCwd = meta.cwd;
        }
        if (!preview) {
          preview = normalizePreview(extractUserText(obj)).slice(0, 80);
        }
      } catch {
        /* malformed line */
      }
      if (lineCount > 20_000) break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (sessionCwd !== cwd) return null;
  return { sessionId, preview: preview || '(空会话)', lineCount };
}

function readSessionMeta(obj: Record<string, unknown>): { id?: string; cwd?: string } | undefined {
  if (obj.type !== 'session_meta') return undefined;
  const payload = obj.payload;
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as { id?: unknown; cwd?: unknown };
  return {
    id: typeof p.id === 'string' ? p.id : undefined,
    cwd: typeof p.cwd === 'string' ? p.cwd : undefined,
  };
}

function sessionIdFromPath(path: string): string {
  return UUID_RE.exec(path)?.[1] ?? path.replace(/\.jsonl$/, '');
}

function extractUserText(obj: Record<string, unknown>): string {
  if (obj.type === 'event_msg') {
    const payload = obj.payload as { type?: unknown; message?: unknown } | undefined;
    if (payload?.type === 'user_message' && typeof payload.message === 'string') {
      return payload.message.trim();
    }
  }

  if (obj.type !== 'response_item') return '';
  const payload = obj.payload as { type?: unknown; role?: unknown; content?: unknown } | undefined;
  if (!payload || payload.type !== 'message' || payload.role !== 'user') return '';
  const content = payload.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: unknown; text?: unknown };
    if (b.type === 'input_text' && typeof b.text === 'string') return b.text.trim();
  }
  return '';
}

function normalizePreview(text: string): string {
  let out = text.trim();
  if (!out || out.startsWith('<environment_context>')) return '';
  if (out.startsWith('# feishu-codex-code-bridge 运行约定')) {
    const marker = '</bridge_context>';
    const idx = out.indexOf(marker);
    if (idx !== -1) out = out.slice(idx + marker.length).trim();
  }
  return out.replace(/\n{2,}/g, '\n').trim();
}

/** Format a relative time like "3 小时前", "昨天", "3 天前". */
export function formatRelTime(mtime: number): string {
  const diffMs = Date.now() - mtime;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '昨天';
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  return `${mo} 个月前`;
}
