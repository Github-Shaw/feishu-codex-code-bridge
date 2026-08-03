import type { LarkChannel } from '@larksuiteoapi/node-sdk';
import { describe, expect, it, vi } from 'vitest';
import { initialState, type RunState } from '../card/run-state';
import { sendStandaloneFinal } from './channel';

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
