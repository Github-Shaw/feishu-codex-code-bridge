import { describe, expect, it } from 'vitest';
import { renderCard } from './run-renderer';
import { initialState } from './run-state';

describe('renderCard progress status', () => {
  it('shows elapsed time when a run stays silent', () => {
    const card = renderCard({ ...initialState, waitedSeconds: 60 });
    expect(JSON.stringify(card)).toContain('仍在处理，已等待 60 秒');
  });

  it('shows context compaction as an active lifecycle event', () => {
    const card = renderCard({
      ...initialState,
      contextCompacted: true,
      waitedSeconds: 90,
    });
    expect(JSON.stringify(card)).toContain('已整理会话上下文，继续处理中，已等待 90 秒');
  });
});
