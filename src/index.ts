#!/usr/bin/env node
// ─────────────────────────────────────────────
//  claude-audit — CLI
// ─────────────────────────────────────────────

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

import { runAudit } from './core/auditor';
import { printReport } from './reporters/terminal';
import { generateMarkdownReport } from './reporters/markdown';
import { generateHtmlReport } from './reporters/html';
import { generateJsonReport } from './reporters/json';
import { AgentLogger } from './reporters/agent-log';
import type { AuditOptions } from './core/types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version: VERSION } = require('../package.json');

const VALID_OUTPUTS: string[] = ['terminal', 'markdown', 'html', 'json'];
const VALID_CATEGORIES: string[] = ['security', 'quality', 'performance', 'architecture', 'dependencies', 'testing', 'documentation'];

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('claude-audit')
    .description('Code auditor: fast static checks, plus an optional Claude-driven audit with read-only tools')
    .version(VERSION, '-v, --version')
    .argument('[path]', 'Path to the project to audit', '.')
    .option('-k, --api-key <key>', 'Anthropic API key (or set ANTHROPIC_API_KEY env var)')
    .option('-o, --output <formats>', 'Output formats: terminal,markdown,html,json (comma-separated)', 'terminal,markdown,html')
    .option('-c, --categories <cats>', 'Audit only specific categories (security,quality,performance,architecture,dependencies,testing,documentation)')
    .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-5-5')
    .option('--max-files <n>', 'Maximum files to scan', '500')
    .option('--max-file-size <kb>', 'Maximum file size in KB to include', '100')
    .option('--static', 'Run static analysis only (no AI)')
    .option('--fast', 'Use one-shot AI mode (no agentic loop). Faster & cheaper but shallower.', false)
    .option('--max-turns <n>', 'Max tool-use iterations for agentic mode', '25')
    .option('--max-budget <tokens>', 'Hard ceiling on total tokens (input+output, cached included) per agentic audit', '500000')
    .option('--no-trace', 'Do not write agent-trace.jsonl (trace is on by default in agentic mode)')
    .option('-V, --verbose', 'Show per-turn token spend, tool durations, and result previews', false)
    .option('--output-dir <dir>', 'Directory for report files (default: .claude-audit/)')
    .option('-q, --quiet', 'Suppress progress output', false)
    .option('--json', 'Output JSON to stdout (for CI/CD)', false)
    .addHelpText('after', `
Examples:
  $ npx claude-audit                              # agentic audit (default when API key set)
  $ npx claude-audit ./my-project
  $ npx claude-audit --verbose                    # show per-turn tokens + tool previews
  $ npx claude-audit --fast                       # one-shot mode (cheaper, shallower)
  $ npx claude-audit --max-turns 40 --max-budget 1000000
  $ npx claude-audit --static --output markdown   # no AI, static only
  $ npx claude-audit --json > audit.json
  $ ANTHROPIC_API_KEY=sk-ant-... npx claude-audit
    `);

  program.parse();

  const opts = program.opts();
  const projectPath = program.args[0] ?? '.';

  const outputFormats = ((opts['output'] as string) ?? 'terminal,markdown,html')
    .split(',')
    .map(f => f.trim()) as AuditOptions['output'];

  if (opts['json']) {
    outputFormats.length = 0;
    outputFormats.push('json');
  }

  const categories = opts['categories']
    ? (opts['categories'] as string).split(',').map(c => c.trim()) as AuditOptions['categories']
    : undefined;

  // A typo here would otherwise produce an empty report that passes CI
  const unknownOutputs = outputFormats.filter(f => !VALID_OUTPUTS.includes(f));
  if (unknownOutputs.length > 0) {
    program.error(`error: unknown output format '${unknownOutputs.join(', ')}'. Valid: ${VALID_OUTPUTS.join(', ')}`, { exitCode: 2 });
  }
  const unknownCategories = (categories ?? []).filter(c => !VALID_CATEGORIES.includes(c));
  if (unknownCategories.length > 0) {
    program.error(`error: unknown category '${unknownCategories.join(', ')}'. Valid: ${VALID_CATEGORIES.join(', ')}`, { exitCode: 2 });
  }

  const resolvedApiKey = (opts['apiKey'] as string | undefined) ?? process.env['ANTHROPIC_API_KEY'];
  // Agentic is the default when an API key is available and --fast wasn't set.
  const agentic = !opts['fast'] && !opts['static'] && !!resolvedApiKey;

  const options: AuditOptions = {
    path: path.resolve(projectPath),
    apiKey: opts['apiKey'] as string | undefined,
    output: outputFormats,
    categories,
    model: (opts['model'] as string) ?? 'claude-sonnet-5-5',
    maxFiles: parseInt(opts['maxFiles'] as string) || 500,
    maxFileSize: parseInt(opts['maxFileSize'] as string) || 100,
    noAi: !!opts['static'],
    quiet: !!opts['quiet'],
    agentic,
    maxTurns: parseInt(opts['maxTurns'] as string) || 25,
    maxBudgetTokens: parseInt(opts['maxBudget'] as string) || 500000,
    // Commander sets `trace` to false when --no-trace is passed, true otherwise.
    trace: opts['trace'] !== false,
  };

  const liveMode = !opts['json'] && !options.quiet;

  // Pre-agent spinner: used during scan + static phases only. For agentic runs
  // the spinner is stopped before the loop starts so the streaming tree has
  // exclusive control of the terminal; for --fast / --static runs we keep the
  // spinner for the whole analysis.
  const spinner = ora({ text: 'Initializing...', color: 'yellow' });
  if (liveMode) spinner.start();

  // Streaming tree logger for agentic runs.
  const agentLogger = liveMode && options.agentic
    ? new AgentLogger({ verbose: !!opts['verbose'] })
    : undefined;

  let spinnerHandedOff = false;

  const progressLog = (msg: string): void => {
    if (!liveMode) return;
    // Once the agent loop has started, spinner has been retired and the
    // logger owns all progress rendering.
    if (spinnerHandedOff && agentLogger) {
      agentLogger.progress(msg);
      return;
    }
    // Hand-off point: the auditor emits this exact message right before it
    // calls into the agentic loop. We stop the spinner and light up the logger.
    if (agentLogger && msg.startsWith('Starting agentic audit')) {
      spinner.stop();
      agentLogger.start({
        model: options.model,
        maxTurns: options.maxTurns,
        maxBudgetTokens: options.maxBudgetTokens,
      });
      spinnerHandedOff = true;
      return;
    }
    spinner.text = chalk.hex('#E8A87C')(msg);
  };

  let exitCode = 0;

  try {
    const report = await runAudit(options, progressLog, {
      agent: agentLogger
        ? {
            onTurnStart:   (info)           => agentLogger.turnStart(info),
            onApiResponse: (info)           => agentLogger.apiResponse(info),
            onToolCall:    (record, meta)   => agentLogger.toolCall(record, meta),
            onTurnEnd:     (info)           => agentLogger.turnEnd(info),
            onFinish:      (summary)        => agentLogger.finish(summary),
          }
        : undefined,
    });

    if (liveMode) {
      if (!spinnerHandedOff) {
        spinner.stop();
      } else {
        // Logger already printed its own finish rule; just a blank line to breathe.
        console.log();
      }
    }

    // Warnings go to stderr in every mode, so they reach CI logs without
    // corrupting --json output on stdout
    for (const warning of report.warnings ?? []) {
      console.error(chalk.yellow(`  warning: ${warning}`));
    }

    // Paths outside the working directory read better absolute than as ../../..
    const shown = (p: string): string => {
      const rel = path.relative(process.cwd(), p);
      return rel.startsWith('..') ? p : rel;
    };

    // Generate outputs
    const reportDir = path.resolve(
      opts['outputDir'] as string ?? path.join(options.path, '.claude-audit'),
    );
    const needsFileOutput = outputFormats.some(f => f !== 'terminal') && !opts['json'];
    if (needsFileOutput) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Persist agent trace when agentic mode ran and trace is enabled
    if (report.agentTrace && options.trace) {
      fs.mkdirSync(reportDir, { recursive: true });
      const tracePath = path.join(reportDir, 'agent-trace.jsonl');
      const lines: string[] = [];
      lines.push(JSON.stringify({ kind: 'meta', model: report.agentTrace.model, maxTurns: report.agentTrace.maxTurns, maxBudgetTokens: report.agentTrace.maxBudgetTokens, summary: report.agentTrace.summary }));
      for (const call of report.agentTrace.calls) {
        lines.push(JSON.stringify({ kind: 'call', ...call }));
      }
      fs.writeFileSync(tracePath, lines.join('\n') + '\n', 'utf-8');
      if (!opts['json'] && !options.quiet) {
        console.log(chalk.gray(`  wrote ${shown(tracePath)}`));
      }
    }

    if (outputFormats.includes('terminal') && !opts['json']) {
      printReport(report);
    }

    if (outputFormats.includes('markdown')) {
      const mdPath = path.join(reportDir, 'audit-report.md');
      generateMarkdownReport(report, mdPath);
      if (!opts['json'] && !options.quiet) {
        console.log(chalk.gray(`  wrote ${shown(mdPath)}`));
      }
    }

    if (outputFormats.includes('html')) {
      const htmlPath = path.join(reportDir, 'audit-report.html');
      generateHtmlReport(report, htmlPath);
      if (!opts['json'] && !options.quiet) {
        console.log(chalk.gray(`  wrote ${shown(htmlPath)}`));
      }
    }

    if (outputFormats.includes('json') || opts['json']) {
      if (opts['json']) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        const jsonPath = path.join(reportDir, 'audit-report.json');
        generateJsonReport(report, jsonPath);
        if (!options.quiet) {
          console.log(chalk.gray(`  wrote ${shown(jsonPath)}`));
        }
      }
    }

    // Exit code: 1 if critical issues found (useful for CI/CD)
    if (report.criticalCount > 0) {
      exitCode = 1;
    }

    if (!opts['json'] && !options.quiet) {
      console.log();
    }

  } catch (err) {
    if (spinner.isSpinning) spinner.fail(chalk.red('Audit failed'));
    console.error(chalk.red('\n  Error: ') + (err instanceof Error ? err.message : String(err)));
    console.error(chalk.gray('\n  Try running with --static if you don\'t have an API key.'));
    exitCode = 2;
  }

  // Let stdout drain before exiting: exiting straight away cuts piped JSON
  // off at the pipe buffer size (64 KB)
  process.stdout.write('', () => process.exit(exitCode));
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
