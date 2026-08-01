import { describe, expect, it } from 'vitest';
import type { AppConfig } from './schema';
import { getShowToolCalls } from './schema';

function cfg(preferences: AppConfig['preferences'] = {}): AppConfig {
  return {
    accounts: {
      app: { id: 'app-id', secret: 'secret', tenant: 'feishu' },
    },
    preferences,
  };
}

describe('getShowToolCalls', () => {
  it('hides tool call details by default', () => {
    expect(getShowToolCalls(cfg())).toBe(false);
    expect(getShowToolCalls({ accounts: cfg().accounts })).toBe(false);
  });

  it('shows tool call details only when explicitly enabled', () => {
    expect(getShowToolCalls(cfg({ showToolCalls: true }))).toBe(true);
    expect(getShowToolCalls(cfg({ showToolCalls: false }))).toBe(false);
  });
});
