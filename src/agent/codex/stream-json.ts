import type { AgentEvent } from '../types';

interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

interface CodexStreamEvent {
  type?: string;
  thread_id?: string;
  usage?: CodexUsage;
  item?: CodexItem;
  error?: { message?: string };
  message?: string;
}

interface CodexItem {
  id?: string;
  type?: string;
  text?: string;
  message?: string;
  command?: string;
  aggregated_output?: string;
  exit_code?: number | null;
  status?: string;
}

export function* translateEvent(raw: unknown): Generator<AgentEvent> {
  if (!raw || typeof raw !== 'object') return;
  const evt = raw as CodexStreamEvent;

  if (evt.type === 'thread.started' && evt.thread_id) {
    yield { type: 'system', sessionId: evt.thread_id };
    return;
  }

  if (evt.type === 'item.started' && evt.item) {
    const tool = toToolUse(evt.item);
    if (tool) yield tool;
    return;
  }

  if (evt.type === 'item.completed' && evt.item) {
    yield* translateCompletedItem(evt.item);
    return;
  }

  if (evt.type === 'turn.completed') {
    if (evt.usage) {
      yield {
        type: 'usage',
        inputTokens: evt.usage.input_tokens,
        outputTokens: evt.usage.output_tokens,
      };
    }
    yield { type: 'done' };
    return;
  }

  if (evt.type === 'turn.failed' || evt.type === 'error') {
    yield { type: 'error', message: eventMessage(evt) ?? 'codex run failed' };
  }
}

function* translateCompletedItem(item: CodexItem): Generator<AgentEvent> {
  if (item.type === 'agent_message' && item.text) {
    yield { type: 'text', delta: item.text };
    return;
  }

  if (item.type === 'command_execution' && item.id) {
    yield {
      type: 'tool_result',
      id: item.id,
      output: item.aggregated_output ?? '',
      isError: typeof item.exit_code === 'number' && item.exit_code !== 0,
    };
    return;
  }

  // Codex also emits item.completed records for non-fatal notices, such as
  // config deprecation warnings. Keeping those out of the user-facing card
  // avoids turning a successful turn into an apparent failure.
}

function toToolUse(item: CodexItem): AgentEvent | undefined {
  if (item.type === 'command_execution' && item.id) {
    return {
      type: 'tool_use',
      id: item.id,
      name: 'Shell',
      input: { command: item.command ?? '' },
    };
  }
  return undefined;
}

function eventMessage(evt: CodexStreamEvent): string | undefined {
  if (evt.error?.message) return evt.error.message;
  if (evt.message) return evt.message;
  if (evt.item?.message) return evt.item.message;
  return undefined;
}
