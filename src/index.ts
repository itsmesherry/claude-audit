#!/usr/bin/env node
// ─────────────────────────────────────────────
//  claude-audit — CLI
// ─────────────────────────────────────────────

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';

import { runAudit } from './core/auditor';
import { printBanner, printReport } from './reporters/terminal';
import { generateMarkdownReport } from './reporters/markdown';
import { generateHtmlReport } from './reporters/html';
import { generateJsonReport } from './reporters/json';
import type { AuditOptions } from './core/types';

const VERSION = '1.0.0';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('claude-audit')
    .description('AI-powered codebase auditor — security, quality, performance, architecture & more')
    .version(VERSION, '-v, --version')
    .argument('[path]', 'Path to the project to audit', '.')
    .option('-k, --api-key <key>', 'Anthropic API key (or set ANTHROPIC_API_KEY env var)')
    .option('-o, --output <formats>', 'Output formats: terminal,markdown,html,json (comma-separated)', 'terminal,markdown,html')
    .option('-c, --categories <cats>', 'Audit only specific categories (security,quality,performance,architecture,dependencies,testing,documentation)')
    .option('-m, --model <model>', 'Claude model to use', 'claude-sonnet-4-6')
    .option('--max-files <n>', 'Maximum files to scan', '500')
    .option('--max-file-size <kb>', 'Maximum file size in KB to include', '100')
    .option('--no-ai', 'Run static analysis only (no AI)', false)
    .option('-q, --quiet', 'Suppress progress output', false)
    .option('--json', 'Output JSON to stdout (for CI/CD)', false)
    .addHelpText('after', `
Examples:
  $ npx claude-audit
  $ npx claude-audit ./my-project
  $ npx claude-audit --api-key sk-ant-... -o terminal,html
  $ npx claude-audit --no-ai --output markdown
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

  const options: AuditOptions = {
    path: path.resolve(projectPath),
    apiKey: opts['apiKey'] as string | undefined,
    output: outputFormats,
    model: (opts['model'] as string) ?? 'claude-sonnet-4-6',
    maxFiles: parseInt(opts['maxFiles'] as string) || 500,
    maxFileSize: parseInt(opts['maxFileSize'] as string) || 100,
    noAi: !!opts['noAi'],
    quiet: !!opts['quiet'],
  };

  // Print banner (unless JSON mode or quiet)
  if (!opts['json'] && !options.quiet) {
    printBanner();
  }

  // Progress spinner
  let spinner = ora({ text: 'Initializing...', color: 'cyan' });
  if (!opts['json'] && !options.quiet) {
    spinner.start();
  }

  const progressLog = (msg: string): void => {
    if (opts['json'] || options.quiet) return;
    spinner.text = chalk.cyan(msg);
  };

  let exitCode = 0;

  try {
    const report = await runAudit(options, progressLog);

    if (!opts['json'] && !options.quiet) {
      spinner.succeed(chalk.green(`Audit complete in ${report.durationMs < 1000 ? report.durationMs + 'ms' : (report.durationMs / 1000).toFixed(1) + 's'}`));
      console.log();
    }

    // Generate outputs
    const absPath = options.path;

    if (outputFormats.includes('terminal') && !opts['json']) {
      printReport(report);
    }

    if (outputFormats.includes('markdown')) {
      const mdPath = path.join(absPath, 'audit-report.md');
      generateMarkdownReport(report, mdPath);
      if (!opts['json'] && !options.quiet) {
        console.log(chalk.gray(`  📄 Markdown report → ${mdPath}`));
      }
    }

    if (outputFormats.includes('html')) {
      const htmlPath = path.join(absPath, 'audit-report.html');
      generateHtmlReport(report, htmlPath);
      if (!opts['json'] && !options.quiet) {
        console.log(chalk.gray(`  🌐 HTML report    → ${htmlPath}`));
      }
    }

    if (outputFormats.includes('json') || opts['json']) {
      if (opts['json']) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        const jsonPath = path.join(absPath, 'audit-report.json');
        generateJsonReport(report, jsonPath);
        if (!options.quiet) {
          console.log(chalk.gray(`  📦 JSON report    → ${jsonPath}`));
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
    spinner.fail(chalk.red('Audit failed'));
    console.error(chalk.red('\n  Error: ') + (err instanceof Error ? err.message : String(err)));
    console.error(chalk.gray('\n  Try running with --no-ai if you don\'t have an API key.'));
    exitCode = 2;
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
