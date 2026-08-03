import { describe, expect, it } from 'vitest';
import type { RunState } from './run-state';
import { renderFinalText, renderText } from './text-renderer';

function state(overrides: Partial<RunState> = {}): RunState {
  return {
    blocks: [],
    reasoning: { content: '', active: false },
    footer: null,
    terminal: 'done',
    ...overrides,
  };
}

describe('renderFinalText', () => {
  it('delivers only the last assistant text block as the final answer', () => {
    expect(
      renderFinalText(
        state({
          blocks: [
            { kind: 'text', content: '先检查日志', streaming: false },
            {
              kind: 'tool',
              tool: { id: 'tool-1', name: 'Shell', input: {}, status: 'done' },
            },
            { kind: 'text', content: '  最终结论  ', streaming: false },
          ],
        }),
      ),
    ).toBe('最终结论');
  });

  it('prioritizes terminal failures over earlier commentary', () => {
    expect(
      renderFinalText(
        state({
          blocks: [{ kind: 'text', content: '仍在排查', streaming: false }],
          terminal: 'error',
          errorMsg: 'request failed',
        }),
      ),
    ).toBe('⚠️ agent 失败:request failed');
  });

  it('renders interrupted and idle-timeout terminal states', () => {
    expect(renderFinalText(state({ terminal: 'interrupted' }))).toBe('_⏹ 已被中断_');
    expect(
      renderFinalText(state({ terminal: 'idle_timeout', idleTimeoutMinutes: 20 })),
    ).toBe('_⏱ 20 分钟无响应,已自动终止_');
  });

  it('returns an explicit marker when a successful run has no text', () => {
    expect(renderFinalText(state())).toBe('_（未返回内容）_');
  });
});

describe('renderText progress status', () => {
  it('renders a low-frequency elapsed-time heartbeat', () => {
    expect(
      renderText(
        state({ terminal: 'running', footer: 'thinking', waitedSeconds: 60 }),
      ),
    ).toBe('_⏳ 仍在处理，已等待 60 秒_');
  });

  it('prioritizes a context compaction notice', () => {
    expect(
      renderText(
        state({
          terminal: 'running',
          footer: 'thinking',
          waitedSeconds: 90,
          contextCompacted: true,
        }),
      ),
    ).toBe('_🧹 已整理会话上下文，继续处理中，已等待 90 秒_');
  });
});
