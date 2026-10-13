// ─────────────────────────────────────────────
//  claude-audit — Agentic Loop (manual, production-grade)
// ─────────────────────────────────────────────
//
// A deliberate, minimal agentic loop with production guardrails:
//   • Iteration cap (circuit breaker for stuck loops)
//   • Token budget (hard cost ceiling)
//   • Repetition detector (kills pathological same-call loops)
//   • Streaming per turn (no SDK HTTP timeouts)
//   • Prompt caching (tools + system prompt + project summary)
//   • Errors-as-results (tools never throw into the loop)
//   • Full audit trace (every tool call recorded)
//   • Progress events (UX while Claude is thinking/searching)
//
// Design inspired by Anthropic's production tool-use guidance and the
// Agent SDK's circuit-breaker patterns, adapted for a non-interactive CLI
// running on untrusted codebases.

import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import type {
  AgentTrace,
  AgentTraceSummary,
  ToolCallRecord,
  AuditCategory,
  ProjectInfo,
  Finding,
  ScannedFile,
  CategoryScore,
} from '../../core/types';
import { scoreToGrade } from '../../core/types';
import {
  TOOL_EXECUTORS,
  buildToolDefinitions,
  type ToolContext,
  type ToolName,
  type FinalAuditPayload,
} from './tools';
import { normalizeFindings, normalizeScore } from './normalize';

// ── Tuning constants ─────────────────────────────
const REPETITION_WINDOW = 6;       // look at last 6 tool calls
const REPETITION_THRESHOLD = 3;    // same call 3x in window = stuck
const OUTPUT_PREVIEW_CHARS = 300;  // what we store in the trace per call

// ── System prompt (stable → cacheable) ───────────
const SYSTEM_PROMPT = `You are Claude Audit — an expert principal engineer conducting a thorough, evidence-based code audit.

Your job is to investigate the codebase using the provided tools, then submit a structured audit via \`finalize_audit\`.

## Method — follow this procedure

1. **Orient.** Call \`get_project_summary\` and \`get_static_findings\` first. Then call \`read_dependency_manifest\`.
2. **Map the surface.** Use \`list_files\` to understand structure. Identify entry points, auth, API routes, data access, config.
3. **Hunt.** Use \`search_code\` aggressively. Look for real risks:
   - Security: \`eval\`, \`exec\`, \`dangerouslySetInnerHTML\`, shell injection, unsanitised SQL, hardcoded secrets, disabled TLS, weak crypto (\`Math.random\` for tokens), unsafe deserialization.
   - Quality: god files (>500 lines), duplicated logic, magic numbers, swallowed errors (empty catch), dead code.
   - Performance: N+1 queries, sync I/O in hot paths, unbounded loops, unindexed lookups.
   - Architecture: circular deps, leaky abstractions, god objects, missing separation of concerns.
   - Testing: missing critical-path tests, flaky patterns (hardcoded ports, sleeps).
   - Documentation: missing READMEs for non-trivial modules, undocumented public APIs.
4. **Verify.** When you find a candidate issue via search, use \`read_file\` to confirm by reading the surrounding context. Never report a finding you have not verified in the actual source.
5. **Submit.** Call \`finalize_audit\` exactly once with your complete findings.

## Standards

- **Evidence required.** Every finding you submit must include \`file\` and \`line\` when applicable, plus a real \`snippet\`. If you could not verify it, do not submit it.
- **Do not duplicate static findings.** You will have seen them via \`get_static_findings\`. Build on them, don't repeat them.
- **Be specific, not generic.** "Add input validation" is weak. "Sanitize \`userInput\` at src/api/posts.ts:42 before passing to \`db.query\` — use parameterized queries" is strong.
- **Calibrate severity honestly.** \`critical\` = likely exploit/data loss in prod. \`high\` = meaningful risk. \`medium\` = quality/maintainability. \`low\` = nit/minor. \`info\` = observation.
- **Budget respect.** You have a bounded number of tool calls. Prioritise high-signal investigation over exhaustive exploration.
- **Output discipline.** When you have enough evidence, finalize. Do not pad with speculative findings.

Return no prose outside of tool calls. Use tool calls to act; use \`finalize_audit\` to conclude.`;

// ── Hooks (caller-facing API) ────────────────────
export interface TurnStartInfo {
  turn: number;
  maxTurns: number;
}

export interface TurnEndInfo {
  turn: number;
  /** Tokens the model spent on *this* turn alone (delta vs cumulative). */
  turnInputTokens: number;
  turnOutputTokens: number;
  turnCacheReadTokens: number;
  turnCacheCreationTokens: number;
  /** Running totals after this turn. */
  cumulativeInputTokens: number;
  cumulativeOutputTokens: number;
  cumulativeCacheReadTokens: number;
  /** Wall-clock duration of this turn (API call + tool execution). */
  durationMs: number;
  /** How many tool_use blocks Claude emitted this turn. */
  toolCalls: number;
}

export interface ToolCallMeta {
  indexInTurn: number;
  totalInTurn: number;
}

export interface AgentLoopHooks {
  onProgress?: (msg: string) => void;
  onToolCall?: (record: ToolCallRecord, meta: ToolCallMeta) => void;
  onTurnStart?: (info: TurnStartInfo) => void;
  onTurnEnd?: (info: TurnEndInfo) => void;
  onFinish?: (summary: AgentTraceSummary) => void;
  /** Emitted when the model's response arrives but before tools execute. */
  onApiResponse?: (info: { turn: number; toolCalls: number }) => void;
}

export interface AgentLoopOptions {
  apiKey: string;
  model: string;
  maxTurns: number;
  maxBudgetTokens: number;
  filterCategories?: AuditCategory[];
}

export interface AgentLoopResult {
  categories: CategoryScore[];
  trace: AgentTrace;
  /** False when the loop ended without finalize_audit; categories are then placeholders. */
  finalized: boolean;
}

// ── Input → project context ──────────────────────
export function buildInitialUserPrompt(
  info: ProjectInfo,
  files: ScannedFile[],
  filterCategories?: AuditCategory[],
): string {
  const cats = filterCategories ?? ['security', 'quality', 'performance', 'architecture', 'testing', 'documentation', 'dependencies'];
  // We deliberately keep this prompt short — Claude will discover everything it
  // needs via tools. The cached system prompt + tool defs do the heavy lifting.
  const topFiles = files
    .slice(0, 20)
    .map(f => `  - ${f.relativePath} (${f.lines} lines)`)
    .join('\n');

  return `Audit this codebase across: ${cats.join(', ')}.

Project root: ${info.path}
Name: ${info.name}

A sample of scanned files (full project is accessible via tools):
${topFiles}

Begin your audit. Call tools to investigate, then submit via finalize_audit.`;
}

// ── Repetition detector ──────────────────────────
/**
 * Hash a tool call by name + canonicalized input. If the same hash appears
 * REPETITION_THRESHOLD+ times within the last REPETITION_WINDOW calls,
 * we consider the agent stuck and trip the circuit breaker.
 */
export function detectRepetition(recent: string[], nextHash: string): boolean {
  const window = [...recent, nextHash].slice(-REPETITION_WINDOW);
  const counts = new Map<string, number>();
  for (const h of window) counts.set(h, (counts.get(h) ?? 0) + 1);
  for (const c of counts.values()) {
    if (c >= REPETITION_THRESHOLD) return true;
  }
  return false;
}

export function hashToolCall(name: string, input: Record<string, unknown>): string {
  // Canonicalize object key order for stable hashes
  const canonical = JSON.stringify(input, Object.keys(input).sort());
  return crypto.createHash('sha1').update(name + '\0' + canonical).digest('hex').slice(0, 16);
}

// ── Main loop ────────────────────────────────────
export async function runAgentLoop(
  ctx: ToolContext,
  opts: AgentLoopOptions,
  hooks: AgentLoopHooks = {},
  initialUserPrompt: string,
): Promise<AgentLoopResult> {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const tools = buildToolDefinitions(opts.filterCategories);
  const trace: ToolCallRecord[] = [];

  let finalPayload: FinalAuditPayload | null = null;
  ctx.onFinalize = (p) => { finalPayload = p; };

  // Budget tracking
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  const recentHashes: string[] = [];

  let stopReason: AgentTraceSummary['stopReason'] = 'error';
  let stopDetail: string | undefined;
  const start = Date.now();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: initialUserPrompt },
  ];

  let turn = 0;
  try {
    while (turn < opts.maxTurns) {
      turn++;
      const turnStartTime = Date.now();
      const preTurnInput = inputTokens;
      const preTurnOutput = outputTokens;
      const preTurnCacheRead = cacheReadTokens;
      const preTurnCacheCreation = cacheCreationTokens;

      hooks.onTurnStart?.({ turn, maxTurns: opts.maxTurns });
      hooks.onProgress?.(`Claude is reasoning (turn ${turn}/${opts.maxTurns}, ${inputTokens + outputTokens} tokens used)...`);

      // Build the request. Prompt-cache the stable parts: system prompt + tool defs.
      // The SDK accepts system as a string OR as a content-block array with cache_control.
      const systemBlocks = [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const },
        },
      ];

      let finalMessage: Anthropic.Message;
      try {
        // Stream each turn so long turns don't hit SDK HTTP timeouts.
        const stream = client.messages.stream({
          model: opts.model,
          max_tokens: 16000,
          system: systemBlocks,
          tools,
          messages,
        });
        finalMessage = await stream.finalMessage();
      } catch (e) {
        stopReason = 'error';
        stopDetail = e instanceof Error ? e.message : String(e);
        hooks.onProgress?.(`⚠ Claude API error on turn ${turn}: ${stopDetail}`);
        break;
      }

      // Update token counters
      const usage = finalMessage.usage;
      inputTokens += usage.input_tokens ?? 0;
      outputTokens += usage.output_tokens ?? 0;
      const uExtra = usage as unknown as {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      cacheReadTokens += uExtra.cache_read_input_tokens ?? 0;
      cacheCreationTokens += uExtra.cache_creation_input_tokens ?? 0;

      // Hard budget ceiling — stop before next call if we're over. Cached
      // tokens are reported separately from input_tokens, so count them too.
      const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
      if (totalTokens > opts.maxBudgetTokens) {
        stopReason = 'max_budget';
        stopDetail = `Token budget exceeded: ${totalTokens} > ${opts.maxBudgetTokens}`;
        // Append assistant's last response so trace is coherent
        messages.push({ role: 'assistant', content: finalMessage.content });
        break;
      }

      // End turn without tool use = Claude is done (but ideally via finalize_audit)
      if (finalMessage.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: finalMessage.content });
        stopReason = finalPayload ? 'completed' : 'error';
        if (!finalPayload) {
          stopDetail = 'Claude ended the turn without calling finalize_audit.';
        }
        break;
      }

      if (finalMessage.stop_reason === 'max_tokens') {
        stopReason = 'error';
        stopDetail = 'Model hit max_tokens mid-turn. Increase max_tokens or reduce task scope.';
        messages.push({ role: 'assistant', content: finalMessage.content });
        break;
      }

      // Collect tool uses
      const toolUseBlocks = finalMessage.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUseBlocks.length === 0) {
        // No tool use and not end_turn — shouldn't happen, but be defensive
        messages.push({ role: 'assistant', content: finalMessage.content });
        stopReason = 'error';
        stopDetail = `Unexpected stop_reason with no tool_use: ${finalMessage.stop_reason}`;
        break;
      }

      messages.push({ role: 'assistant', content: finalMessage.content });

      hooks.onApiResponse?.({ turn, toolCalls: toolUseBlocks.length });

      // Execute tool calls (sequentially — keeps ordering stable for UI + trace)
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let trippedRepetition = false;

      for (let idx = 0; idx < toolUseBlocks.length; idx++) {
        const block = toolUseBlocks[idx];
        const meta: ToolCallMeta = { indexInTurn: idx, totalInTurn: toolUseBlocks.length };
        const name = block.name as ToolName;
        const input = (block.input ?? {}) as Record<string, unknown>;

        // Repetition detection — check BEFORE executing
        const h = hashToolCall(name, input);
        if (detectRepetition(recentHashes, h)) {
          trippedRepetition = true;
          const msg = `Circuit breaker: same tool call repeated ${REPETITION_THRESHOLD} times in the last ${REPETITION_WINDOW} calls. Aborting to prevent wasted budget. Call finalize_audit with what you have.`;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: msg,
            is_error: true,
          });
          const record: ToolCallRecord = {
            turn,
            toolUseId: block.id,
            name,
            input,
            outputPreview: msg.slice(0, OUTPUT_PREVIEW_CHARS),
            outputBytes: Buffer.byteLength(msg, 'utf-8'),
            durationMs: 0,
            isError: true,
            timestamp: new Date().toISOString(),
          };
          trace.push(record);
          hooks.onToolCall?.(record, meta);
          continue;
        }
        recentHashes.push(h);

        hooks.onProgress?.(`→ ${name}${summarizeInput(name, input)}`);

        const tStart = Date.now();
        const executor = TOOL_EXECUTORS[name];
        let result: { isError: boolean; content: string; bytes: number };

        if (!executor) {
          result = {
            isError: true,
            content: `Unknown tool: ${name}. Available: ${Object.keys(TOOL_EXECUTORS).join(', ')}`,
            bytes: 0,
          };
        } else {
          try {
            result = await executor(ctx, input);
          } catch (e) {
            // Executors should never throw — but defensive just in case
            result = {
              isError: true,
              content: `Internal tool error: ${e instanceof Error ? e.message : String(e)}`,
              bytes: 0,
            };
          }
        }
        const durationMs = Date.now() - tStart;

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError,
        });

        const record: ToolCallRecord = {
          turn,
          toolUseId: block.id,
          name,
          input,
          outputPreview: result.content.slice(0, OUTPUT_PREVIEW_CHARS),
          outputBytes: result.bytes,
          durationMs,
          isError: result.isError,
          timestamp: new Date().toISOString(),
        };
        trace.push(record);
        hooks.onToolCall?.(record, meta);

        // If finalize_audit was called, we'll bail out of the loop cleanly
        // after sending its tool_result back. But since calling finalize
        // set finalPayload, we can stop early.
        if (name === 'finalize_audit' && finalPayload) {
          break;
        }
      }

      // Emit turn-end with per-turn usage delta so the UI can show cache %, etc.
      hooks.onTurnEnd?.({
        turn,
        turnInputTokens: inputTokens - preTurnInput,
        turnOutputTokens: outputTokens - preTurnOutput,
        turnCacheReadTokens: cacheReadTokens - preTurnCacheRead,
        turnCacheCreationTokens: cacheCreationTokens - preTurnCacheCreation,
        cumulativeInputTokens: inputTokens,
        cumulativeOutputTokens: outputTokens,
        cumulativeCacheReadTokens: cacheReadTokens,
        durationMs: Date.now() - turnStartTime,
        toolCalls: toolUseBlocks.length,
      });

      // Budget-awareness nudge: when we pass 70% of the turn/token budget,
      // append a plain text hint to the user-turn so Claude finalises rather
      // than keeps exploring. Client-side analogue of the task-budgets beta —
      // a soft signal the model uses to pace itself.
      const turnProgress = turn / opts.maxTurns;
      const tokenProgress = (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens) / opts.maxBudgetTokens;
      const turnContent: (Anthropic.ToolResultBlockParam | Anthropic.TextBlockParam)[] = [...toolResults];
      if (turnProgress >= 0.7 || tokenProgress >= 0.7) {
        const remainingTurns = opts.maxTurns - turn;
        turnContent.push({
          type: 'text',
          text:
            `[budget] ${remainingTurns} turn(s) remaining out of ${opts.maxTurns}. ` +
            `Wrap up your investigation and call finalize_audit with what you have now.`,
        });
      }
      messages.push({ role: 'user', content: turnContent });

      if (trippedRepetition) {
        stopReason = 'repetition';
        stopDetail = 'Repetition circuit breaker tripped.';
        break;
      }

      if (finalPayload) {
        stopReason = 'completed';
        break;
      }
    }

    if (turn >= opts.maxTurns && stopReason === 'error') {
      stopReason = 'max_turns';
      stopDetail = `Hit hard ceiling of ${opts.maxTurns} turns without finalize_audit.`;
    }
  } catch (e) {
    stopReason = 'error';
    stopDetail = e instanceof Error ? e.message : String(e);
  }

  const durationMs = Date.now() - start;
  const toolUsage: Record<string, number> = {};
  for (const r of trace) toolUsage[r.name] = (toolUsage[r.name] ?? 0) + 1;

  const summary: AgentTraceSummary = {
    turns: turn,
    toolCalls: trace.length,
    errors: trace.filter(r => r.isError).length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    stopReason,
    stopDetail,
    durationMs,
    toolUsage,
  };

  hooks.onFinish?.(summary);

  const agentTrace: AgentTrace = {
    enabled: true,
    model: opts.model,
    maxTurns: opts.maxTurns,
    maxBudgetTokens: opts.maxBudgetTokens,
    summary,
    calls: trace,
  };

  const categories = buildCategoriesFromFinal(finalPayload, opts.filterCategories);
  return { categories, trace: agentTrace, finalized: finalPayload !== null };
}

// ── Finalization → CategoryScore[] ───────────────
function buildCategoriesFromFinal(
  payload: FinalAuditPayload | null,
  filter?: AuditCategory[],
): CategoryScore[] {
  const allCategoryOrder: AuditCategory[] = ['security', 'quality', 'performance', 'architecture', 'testing', 'documentation', 'dependencies'];
  const order = filter ?? allCategoryOrder;

  if (!payload) {
    // Agent stopped without finalizing — return empty placeholders so caller
    // can gracefully merge with static findings.
    return order.map(cat => ({
      category: cat,
      score: 50,
      grade: 'C' as const,
      findings: [],
      summary: 'Agentic audit ended without a finalized submission.',
    }));
  }

  // A category the model left out is left out of the report too: the caller
  // warns about it rather than showing a score nobody gave
  return order.flatMap(cat => {
    const data = payload[cat as keyof FinalAuditPayload];
    if (!data) return [];

    const score = normalizeScore(data.score, 50);
    const findings = normalizeFindings(data.findings, cat, `${cat.toUpperCase().slice(0, 3)}-AGENT`);

    return {
      category: cat,
      score,
      grade: scoreToGrade(score),
      findings,
      summary: typeof data.summary === 'string' ? data.summary : '',
    };
  });
}

// ── Progress helpers ─────────────────────────────
function summarizeInput(name: ToolName, input: Record<string, unknown>): string {
  switch (name) {
    case 'list_files': {
      const p = typeof input['pattern'] === 'string' ? input['pattern'] : '**/*';
      return `: ${p}`;
    }
    case 'read_file': {
      const p = typeof input['path'] === 'string' ? input['path'] : '?';
      const range = input['start_line'] || input['end_line']
        ? ` [${input['start_line'] ?? 1}:${input['end_line'] ?? '∞'}]`
        : '';
      return `: ${p}${range}`;
    }
    case 'search_code': {
      const p = typeof input['pattern'] === 'string' ? input['pattern'] : '?';
      const scope = typeof input['file_pattern'] === 'string' ? ` in ${input['file_pattern']}` : '';
      return `: ${JSON.stringify(p)}${scope}`;
    }
    case 'finalize_audit':
      return ' — submitting report';
    default:
      return '';
  }
}
