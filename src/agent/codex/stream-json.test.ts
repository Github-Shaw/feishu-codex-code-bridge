import { describe, expect, it } from 'vitest';
import { translateEvent } from './stream-json';

describe('translateEvent', () => {
  it('translates Codex thread and final answer events', () => {
    expect([...translateEvent({ type: 'thread.started', thread_id: 'session-1' })]).toEqual([
      { type: 'system', sessionId: 'session-1' },
    ]);

    expect([
      ...translateEvent({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'done' },
      }),
    ]).toEqual([{ type: 'text', delta: 'done' }]);

    expect([
      ...translateEvent({
        type: 'turn.completed',
        usage: { input_tokens: 10, output_tokens: 2 },
      }),
    ]).toEqual([
      { type: 'usage', inputTokens: 10, outputTokens: 2 },
      { type: 'done' },
    ]);
  });

  it('translates command execution lifecycle events', () => {
    expect([
      ...translateEvent({
        type: 'item.started',
        item: {
          id: 'item_2',
          type: 'command_execution',
          command: '/bin/bash -lc pwd',
          status: 'in_progress',
        },
      }),
    ]).toEqual([
      {
        type: 'tool_use',
        id: 'item_2',
        name: 'Shell',
        input: { command: '/bin/bash -lc pwd' },
      },
    ]);

    expect([
      ...translateEvent({
        type: 'item.completed',
        item: {
          id: 'item_2',
          type: 'command_execution',
          aggregated_output: '/tmp\n',
          exit_code: 0,
          status: 'completed',
        },
      }),
    ]).toEqual([
      { type: 'tool_result', id: 'item_2', output: '/tmp\n', isError: false },
    ]);
  });

  it('ignores non-fatal item error notices', () => {
    expect([
      ...translateEvent({
        type: 'item.completed',
        item: { id: 'item_0', type: 'error', message: 'config warning' },
      }),
    ]).toEqual([]);
  });
});
