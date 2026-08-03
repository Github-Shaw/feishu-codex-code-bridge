import type { Block, RunState, ToolEntry } from './run-state';
import { toolHeaderText } from './tool-render';

/**
 * Render `RunState` as plain markdown text — used in `messageReply: 'text'`
 * mode where we stream a markdown message instead of a card.
 *
 * Differences vs `renderCard`:
 *   - No collapsible panels, no buttons (markdown messages have neither)
 *   - Tool calls collapse to a single short line each (no body)
 *   - No reasoning / thinking output (no place to fold it; would be noise)
 *   - Footer is appended inline at the bottom while running
 */
export function renderText(state: RunState): string {
  const parts: string[] = [];

  for (const block of state.blocks) {
    const piece = renderBlock(block);
    if (piece) parts.push(piece);
  }

  if (state.terminal === 'interrupted') {
    parts.push('_⏹ 已被中断_');
  } else if (state.terminal === 'idle_timeout') {
    const mins = state.idleTimeoutMinutes ?? 0;
    parts.push(`_⏱ ${mins} 分钟无响应,已自动终止_`);
  } else if (state.terminal === 'error' && state.errorMsg) {
    parts.push(`⚠️ agent 失败:${state.errorMsg}`);
  } else if (state.terminal === 'running' && state.footer) {
    parts.push(footerLine(state));
  }

  return parts.join('\n\n');
}

/**
 * Render the canonical terminal delivery for a run.
 *
 * Streaming cards are progress surfaces, not a reliable delivery channel:
 * Feishu closes them after roughly ten minutes.  The bridge therefore sends
 * this compact result as a separate message once the run reaches a terminal
 * state.  On success, the last text block is the agent's final answer; prior
 * text blocks are progress commentary and tool narration.
 */
export function renderFinalText(state: RunState): string {
  if (state.terminal === 'interrupted') return '_⏹ 已被中断_';
  if (state.terminal === 'idle_timeout') {
    const mins = state.idleTimeoutMinutes ?? 0;
    return `_⏱ ${mins} 分钟无响应,已自动终止_`;
  }
  if (state.terminal === 'error') {
    return state.errorMsg ? `⚠️ agent 失败:${state.errorMsg}` : '⚠️ agent 失败';
  }

  for (let i = state.blocks.length - 1; i >= 0; i -= 1) {
    const block = state.blocks[i];
    if (block?.kind !== 'text') continue;
    const text = block.content.trim();
    if (text) return text;
  }

  return '_（未返回内容）_';
}

function renderBlock(block: Block): string {
  if (block.kind === 'text') {
    return block.content.trim();
  }
  return toolLine(block.tool);
}

/**
 * One-line summary for a tool call:
 *   `> ⏳ **Bash** — git status`
 *   `> ✅ **Read** — ~/code/foo.ts`
 * Reuses `toolHeaderText` so the format matches the card mode header.
 */
function toolLine(tool: ToolEntry): string {
  return `> ${toolHeaderText(tool)}`;
}

function footerLine(state: RunState): string {
  if (state.contextCompacted) {
    const waited = state.waitedSeconds ? `，已等待 ${state.waitedSeconds} 秒` : '';
    return `_🧹 已整理会话上下文，继续处理中${waited}_`;
  }
  if (state.waitedSeconds) return `_⏳ 仍在处理，已等待 ${state.waitedSeconds} 秒_`;
  const status = state.footer;
  if (status === 'thinking') return '_🧠 正在思考…_';
  if (status === 'tool_running') return '_🧰 正在调用工具…_';
  return '_✍️ 正在输出…_';
}
