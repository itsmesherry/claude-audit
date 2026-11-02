/* eslint-disable @typescript-eslint/no-explicit-any */
// ─────────────────────────────────────────────
//  Integration tests for runAgentLoop.
//
//  The Anthropic SDK is mocked at module level so we can script exactly what
//  each turn returns (tool_use blocks, stop_reasons, usage tokens, or errors)
//  and then assert the loop's branching behaviour end-to-end.
// ─────────────────────────────────────────────

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ── Mock Anthropic SDK ───────────────────────────
// Each scripted entry is either an Anthropic.Message or an Error.
// The mock's stream() pops the next entry per call.
type Scripted = any | Error;
const scriptedQueue: Scripted[] = [];
const streamCalls: Array<{ messages: any[]; system: any; tools: any[] }> = [];

function resetMock(): void {
  scriptedQueue.length = 0;
  streamCalls.length = 0;
}

function scriptResponse(msg: any): void {
  scriptedQueue.push(msg);
}

function scriptError(err: Error): void {
  scriptedQueue.push(err);
}

jest.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor(_opts: any) { void _opts; }
    messages = {
      stream: (params: any) => {
        streamCalls.push({ messages: params.messages, system: params.system, tools: params.tools });
        const next = scriptedQueue.shift();
        if (next === undefined) {
          throw new Error('MockAnthropic: no scripted response for this call');
        }
        if (next instanceof Error) {
          // The real SDK throws from stream() when headers/body fail, so mirror that.
          throw next;
        }
        return {
          finalMessage: async () => next,
        };
      },
    };
  }
  return { __esModule: true, default: MockAnthropic };
});

// ── Import AFTER jest.mock ───────────────────────
import { runAgentLoop } from '../../../src/analyzers/ai/agent-loop';
import type { ToolContext, FinalAuditPayload } from '../../../src/analyzers/ai/tools';

// ── Helpers to build scripted messages ──────────
interface MessageOpts {
  toolUses?: Array<{ id?: string; name: string; input: Record<string, unknown> }>;
  text?: string;
  stopReason?: 'tool_use' | 'end_turn' | 'max_tokens';
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function buildMessage(opts: MessageOpts): any {
  const content: any[] = [];
  if (opts.text) content.push({ type: 'text', text: opts.text, citations: null });
  for (const tu of opts.toolUses ?? []) {
    content.push({
      type: 'tool_use',
      id: tu.id ?? `tu_${Math.random().toString(36).slice(2, 10)}`,
      name: tu.name,
      input: tu.input,
    });
  }
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content,
    stop_reason: opts.stopReason ?? (opts.toolUses?.length ? 'tool_use' : 'end_turn'),
    stop_sequence: null,
    usage: {
      input_tokens: opts.usage?.input_tokens ?? 100,
      output_tokens: opts.usage?.output_tokens ?? 50,
      cache_read_input_tokens: opts.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: opts.usage?.cache_creation_input_tokens ?? 0,
    },
  };
}

function makeCtx(): { ctx: ToolContext; tmpDir: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-loop-'));
  fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const x = 1;\n');
  const ctx: ToolContext = {
    projectRoot: tmpDir,
    projectInfo: {
      path: tmpDir,
      name: 'test-project',
      languages: { TypeScript: 1 },
      frameworks: [],
      totalFiles: 1,
      totalLines: 1,
      hasTests: false,
      hasDependencyFile: false,
      dependencies: {},
      testFrameworks: [],
    },
    staticFindings: [],
    onFinalize: () => { /* overwritten by the loop */ },
  };
  return { ctx, tmpDir };
}

function validFinalPayload(): FinalAuditPayload {
  return {
    security: {
      score: 80,
      summary: 'No critical issues found.',
      findings: [
        {
          title: 'Example',
          severity: 'low',
          description: 'An example low-severity finding.',
          category: 'security',
        },
      ],
    },
  };
}

// ── Tests ────────────────────────────────────────
describe('runAgentLoop', () => {
  beforeEach(() => resetMock());

  it('returns the dismissals and coverage from finalize_audit', async () => {
    const { ctx, tmpDir } = makeCtx();
    ctx.staticFindings = [
      { id: 'SEC-010', category: 'security', severity: 'high', title: 'eval() Usage', description: 'x', file: 'a.js', line: 3 },
    ];
    scriptResponse(buildMessage({
      toolUses: [{
        name: 'finalize_audit',
        input: {
          ...validFinalPayload(),
          dismissed_static: [{ ref: 1, reason: 'The match is inside a comment.' }],
          coverage: { checked: ['eval usage'], not_checked: ['tests/'] },
        } as any,
      }],
    }));

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 5, maxBudgetTokens: 500_000 },
      {},
      'Audit this project.',
    );

    expect(result.dismissed).toEqual([{ finding: ctx.staticFindings[0], reason: 'The match is inside a comment.' }]);
    expect(result.coverage).toEqual({ checked: ['eval usage'], notChecked: ['tests/'] });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('happy path: tool_use → tool_result → finalize_audit → completed', async () => {
    const { ctx, tmpDir } = makeCtx();

    // Turn 1: Claude calls list_files
    scriptResponse(buildMessage({
      toolUses: [{ name: 'list_files', input: { pattern: '**/*.ts' } }],
      usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 3000 },
    }));
    // Turn 2: Claude calls finalize_audit
    scriptResponse(buildMessage({
      toolUses: [{ name: 'finalize_audit', input: validFinalPayload() as any }],
      usage: { input_tokens: 300, output_tokens: 80 },
    }));

    const turnStarts: number[] = [];
    const toolCalls: string[] = [];
    let finished = false;

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 10, maxBudgetTokens: 500_000 },
      {
        onTurnStart: ({ turn }) => turnStarts.push(turn),
        onToolCall: (r) => toolCalls.push(r.name),
        onFinish: () => { finished = true; },
      },
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('completed');
    expect(result.trace.summary.turns).toBe(2);
    expect(turnStarts).toEqual([1, 2]);
    expect(toolCalls).toEqual(['list_files', 'finalize_audit']);
    expect(finished).toBe(true);
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories[0].category).toBe('security');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stops with max_turns when Claude never calls finalize_audit', async () => {
    const { ctx, tmpDir } = makeCtx();

    // Script 3 turns that each call list_files with different args (so
    // repetition detection doesn't trip).
    for (let i = 0; i < 3; i++) {
      scriptResponse(buildMessage({
        toolUses: [{ name: 'list_files', input: { pattern: `**/*.${i}.ts` } }],
        usage: { input_tokens: 50, output_tokens: 20 },
      }));
    }

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 3, maxBudgetTokens: 500_000 },
      {},
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('max_turns');
    expect(result.trace.summary.turns).toBe(3);
    expect(result.trace.summary.stopDetail).toMatch(/Hit hard ceiling of 3 turns/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stops with max_budget when cumulative tokens exceed the ceiling', async () => {
    const { ctx, tmpDir } = makeCtx();

    // One turn that burns more than the budget
    scriptResponse(buildMessage({
      toolUses: [{ name: 'list_files', input: { pattern: '**/*' } }],
      usage: { input_tokens: 600, output_tokens: 500 },
    }));

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 10, maxBudgetTokens: 1_000 },
      {},
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('max_budget');
    expect(result.trace.summary.stopDetail).toMatch(/Token budget exceeded/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('trips the repetition circuit breaker when Claude spams the same call', async () => {
    const { ctx, tmpDir } = makeCtx();

    // Three turns, each calling search_code with IDENTICAL args → hashes match.
    for (let i = 0; i < 3; i++) {
      scriptResponse(buildMessage({
        toolUses: [{ name: 'search_code', input: { pattern: 'TODO' } }],
        usage: { input_tokens: 50, output_tokens: 20 },
      }));
    }

    const toolCalls: Array<{ name: string; isError: boolean }> = [];
    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 10, maxBudgetTokens: 500_000 },
      { onToolCall: (r) => toolCalls.push({ name: r.name, isError: r.isError }) },
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('repetition');
    // The third call should be recorded as an error (the circuit breaker's
    // synthetic tool_result).
    expect(toolCalls[toolCalls.length - 1]).toEqual({ name: 'search_code', isError: true });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('captures SDK errors as stopReason=error without crashing', async () => {
    const { ctx, tmpDir } = makeCtx();

    scriptError(new Error('429 rate_limit_error'));

    const progressMsgs: string[] = [];
    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 5, maxBudgetTokens: 500_000 },
      { onProgress: (m) => progressMsgs.push(m) },
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('error');
    expect(result.trace.summary.stopDetail).toMatch(/rate_limit_error/);
    expect(progressMsgs.some(m => m.includes('⚠ Claude API error'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends a budget-aware nudge to the user turn after 70% usage', async () => {
    const { ctx, tmpDir } = makeCtx();

    // Turn 1: burn enough tokens to cross the 70% token threshold, then
    // request a tool call so the loop appends tool_result(s) to a user turn.
    scriptResponse(buildMessage({
      toolUses: [{ name: 'list_files', input: { pattern: '**/*' } }],
      usage: { input_tokens: 800, output_tokens: 0 }, // 800/1000 = 80% → triggers nudge
    }));
    // Turn 2: finalize so the loop terminates cleanly.
    scriptResponse(buildMessage({
      toolUses: [{ name: 'finalize_audit', input: validFinalPayload() as any }],
      usage: { input_tokens: 50, output_tokens: 50 },
    }));

    await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 10, maxBudgetTokens: 1_000 },
      {},
      'Audit this project.',
    );

    // The SECOND turn's messages array should include a user message whose
    // content contains both tool_result(s) and a text block with [budget].
    const secondCall = streamCalls[1];
    const lastUserMsg = [...secondCall.messages].reverse().find(m => m.role === 'user');
    expect(lastUserMsg).toBeDefined();
    const hasBudgetText = Array.isArray(lastUserMsg.content)
      && lastUserMsg.content.some((b: any) => b.type === 'text' && /\[budget\]/.test(b.text));
    expect(hasBudgetText).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('marks stopReason=error when Claude ends the turn without calling finalize_audit', async () => {
    const { ctx, tmpDir } = makeCtx();

    scriptResponse(buildMessage({
      text: 'All done.',
      stopReason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
    }));

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 5, maxBudgetTokens: 500_000 },
      {},
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('error');
    expect(result.trace.summary.stopDetail).toMatch(/finalize_audit/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('marks stopReason=error when Claude hits max_tokens mid-turn', async () => {
    const { ctx, tmpDir } = makeCtx();

    scriptResponse(buildMessage({
      toolUses: [{ name: 'list_files', input: { pattern: '**/*' } }],
      stopReason: 'max_tokens',
      usage: { input_tokens: 100, output_tokens: 16000 },
    }));

    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 5, maxBudgetTokens: 500_000 },
      {},
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('error');
    expect(result.trace.summary.stopDetail).toMatch(/max_tokens/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports an error when an unknown tool is invoked by Claude', async () => {
    const { ctx, tmpDir } = makeCtx();

    scriptResponse(buildMessage({
      toolUses: [{ name: 'not_a_real_tool' as any, input: {} }],
      usage: { input_tokens: 50, output_tokens: 20 },
    }));
    scriptResponse(buildMessage({
      toolUses: [{ name: 'finalize_audit', input: validFinalPayload() as any }],
      usage: { input_tokens: 50, output_tokens: 20 },
    }));

    const toolCalls: Array<{ name: string; isError: boolean }> = [];
    const result = await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 5, maxBudgetTokens: 500_000 },
      { onToolCall: (r) => toolCalls.push({ name: r.name, isError: r.isError }) },
      'Audit this project.',
    );

    expect(result.trace.summary.stopReason).toBe('completed');
    expect(toolCalls[0]).toEqual({ name: 'not_a_real_tool', isError: true });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('propagates turn-start / turn-end / api-response hooks with correct counts', async () => {
    const { ctx, tmpDir } = makeCtx();

    scriptResponse(buildMessage({
      toolUses: [
        { name: 'list_files',    input: { pattern: '**/*.ts' } },
        { name: 'get_project_summary', input: {} },
      ],
      usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 2000 },
    }));
    scriptResponse(buildMessage({
      toolUses: [{ name: 'finalize_audit', input: validFinalPayload() as any }],
      usage: { input_tokens: 200, output_tokens: 40 },
    }));

    const apiResponses: number[] = [];
    const turnEnds: Array<{ turn: number; toolCalls: number }> = [];

    await runAgentLoop(
      ctx,
      { apiKey: 'test', model: 'claude-sonnet-4-6', maxTurns: 10, maxBudgetTokens: 500_000 },
      {
        onApiResponse: ({ toolCalls }) => apiResponses.push(toolCalls),
        onTurnEnd: ({ turn, toolCalls }) => turnEnds.push({ turn, toolCalls }),
      },
      'Audit this project.',
    );

    expect(apiResponses).toEqual([2, 1]);
    expect(turnEnds).toEqual([
      { turn: 1, toolCalls: 2 },
      { turn: 2, toolCalls: 1 },
    ]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
