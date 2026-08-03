import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import type { AgentRun } from '../agent/types';
import { initialState, type RunState } from '../card/run-state';
import type { SessionStore } from '../session/store';
import type { RunHandle } from './active-runs';
import { processAgentStream, sendStandaloneFinal } from './channel';

function terminalState(terminal: RunState['terminal']): RunState {
  return { ...initialState, terminal };
}

function fakeChannel(events: string[], sendError?: Error): Pick<LarkChannel, 'send' | 'recallMessage'> {
  return {
    send: vi.fn(async () => {
      events.push('final-sent');
      if (sendError) throw sendError;
      return { messageId: 'om_final' };
    }),
    recallMessage: vi.fn(async (messageId: string) => {
      events.push(`recalled:${messageId}`);
    }),
  } as Pick<LarkChannel, 'send' | 'recallMessage'>;
}

describe('sendStandaloneFinal', () => {
  const sendOpts = { replyTo: 'om_user' };
  const streamReply = { messageId: 'om_stream', chunkIds: ['om_stream_2'] };

  it('recalls stream messages only after a completed final is sent', async () => {
    const events: string[] = [];
    await sendStandaloneFinal(
      fakeChannel(events),
      'oc_chat',
      terminalState('done'),
      sendOpts,
      streamReply,
    );

    expect(events).toEqual(['final-sent', 'recalled:om_stream', 'recalled:om_stream_2']);
  });

  it('keeps the stream when the run did not complete successfully', async () => {
    const events: string[] = [];
    await sendStandaloneFinal(
      fakeChannel(events),
      'oc_chat',
      terminalState('interrupted'),
      sendOpts,
      streamReply,
    );

    expect(events).toEqual(['final-sent']);
  });

  it('does not recall the stream when final delivery fails', async () => {
    const events: string[] = [];
    await expect(
      sendStandaloneFinal(
        fakeChannel(events, new Error('send failed')),
        'oc_chat',
        terminalState('done'),
        sendOpts,
        streamReply,
      ),
    ).rejects.toThrow('send failed');

    expect(events).toEqual(['final-sent']);
  });
});

describe('processAgentStream progress heartbeat', () => {
  it('updates a silent run after 30 seconds', async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run: AgentRun = {
      events: (async function* () {
        await gate;
        yield { type: 'done' as const };
      })(),
      stop: vi.fn(async () => undefined),
      waitForExit: vi.fn(async () => true),
    };
    const handle: RunHandle = { run, interrupted: false };
    const flush = vi.fn(async () => undefined);

    try {
      const processing = processAgentStream(
        handle,
        {} as SessionStore,
        'oc_chat',
        '/work',
        undefined,
        flush,
      );
      await vi.advanceTimersByTimeAsync(30_000);

      expect(flush).toHaveBeenCalledWith(
        expect.objectContaining({
          terminal: 'running',
          waitedSeconds: 30,
        }),
      );

      finish();
      await processing;
    } finally {
      vi.useRealTimers();
    }
  });
});
