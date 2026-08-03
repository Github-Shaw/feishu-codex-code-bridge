import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { contextCompactionTimestamp, monitorContextCompactions } from './rollout-monitor';

describe('contextCompactionTimestamp', () => {
  it('recognizes the context_compacted rollout event', () => {
    expect(
      contextCompactionTimestamp(
        JSON.stringify({
          timestamp: '2026-08-03T12:14:58.669Z',
          type: 'event_msg',
          payload: { type: 'context_compacted' },
        }),
      ),
    ).toBe(Date.parse('2026-08-03T12:14:58.669Z'));
  });

  it('ignores the large compaction payload and malformed records', () => {
    expect(
      contextCompactionTimestamp(
        JSON.stringify({
          timestamp: '2026-08-03T12:14:58.645Z',
          type: 'compacted',
          payload: { replacement_history: [] },
        }),
      ),
    ).toBeUndefined();
    expect(contextCompactionTimestamp('{"context_compacted"')).toBeUndefined();
  });

  it('tails only the active session and reports appended compaction', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codex-rollout-monitor-'));
    const nested = join(root, '2026', '08', '03');
    const sessionId = '019fc76a-0c7c-74e0-9406-edaf3c13e728';
    const path = join(nested, `rollout-test-${sessionId}.jsonl`);
    await mkdir(nested, { recursive: true });
    await writeFile(path, '{"timestamp":"2020-01-01T00:00:00.000Z","type":"event_msg","payload":{"type":"context_compacted"}}\n');
    const abort = new AbortController();
    const onCompacted = vi.fn();

    try {
      const monitoring = monitorContextCompactions({
        sessionId,
        sinceMs: Date.now(),
        signal: abort.signal,
        onCompacted,
        sessionsDir: root,
        pollMs: 5,
      });
      await new Promise((resolve) => setTimeout(resolve, 15));
      await appendFile(
        path,
        `${JSON.stringify({
          timestamp: new Date().toISOString(),
          type: 'event_msg',
          payload: { type: 'context_compacted' },
        })}\n`,
      );

      await vi.waitFor(() => expect(onCompacted).toHaveBeenCalledTimes(1));
      abort.abort();
      await monitoring;
    } finally {
      abort.abort();
      await rm(root, { recursive: true, force: true });
    }
  });
});
