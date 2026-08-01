import { describe, expect, it } from 'vitest';
import { BRIDGE_DEVELOPER_INSTRUCTIONS, buildCodexArgs } from './adapter';

describe('buildCodexArgs', () => {
  it('injects bridge policy as one-off developer instructions', () => {
    const args = buildCodexArgs({
      cwd: '/work/repo',
      sandbox: 'danger-full-access',
      approvalPolicy: 'never',
      developerInstructions: 'line one\n"line two"',
      extraArgs: [],
    });

    expect(args).toContain('-C');
    expect(args).toContain('/work/repo');
    expect(args).toContain('-c');
    expect(args).toContain('developer_instructions="line one\\n\\"line two\\""');
    expect(args.at(-1)).toBe('-');
  });

  it('contains the analysis evidence contract', () => {
    expect(BRIDGE_DEVELOPER_INSTRUCTIONS).toContain('分析与排障的证据约定');
    expect(BRIDGE_DEVELOPER_INSTRUCTIONS).toContain('不得把抽样或外推直接写成已确认根因');
  });

  it('preserves resume argument ordering', () => {
    const args = buildCodexArgs({
      sessionId: 'session-1',
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      extraArgs: [],
    });

    expect(args.slice(-6)).toEqual([
      'exec',
      'resume',
      '--json',
      '--skip-git-repo-check',
      'session-1',
      '-',
    ]);
  });
});
