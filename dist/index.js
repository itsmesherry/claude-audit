#!/usr/bin/env node
"use strict";
// ─────────────────────────────────────────────
//  claude-audit — CLI
// ─────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const path_1 = __importDefault(require("path"));
const auditor_1 = require("./core/auditor");
const terminal_1 = require("./reporters/terminal");
const markdown_1 = require("./reporters/markdown");
const html_1 = require("./reporters/html");
const json_1 = require("./reporters/json");
const VERSION = '1.0.0';
async function main() {
    const program = new commander_1.Command();
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
    const outputFormats = (opts['output'] ?? 'terminal,markdown,html')
        .split(',')
        .map(f => f.trim());
    if (opts['json']) {
        outputFormats.length = 0;
        outputFormats.push('json');
    }
    const options = {
        path: path_1.default.resolve(projectPath),
        apiKey: opts['apiKey'],
        output: outputFormats,
        model: opts['model'] ?? 'claude-sonnet-4-6',
        maxFiles: parseInt(opts['maxFiles']) || 500,
        maxFileSize: parseInt(opts['maxFileSize']) || 100,
        noAi: !!opts['noAi'],
        quiet: !!opts['quiet'],
    };
    // Print banner (unless JSON mode or quiet)
    if (!opts['json'] && !options.quiet) {
        (0, terminal_1.printBanner)();
    }
    // Progress spinner
    let spinner = (0, ora_1.default)({ text: 'Initializing...', color: 'cyan' });
    if (!opts['json'] && !options.quiet) {
        spinner.start();
    }
    const progressLog = (msg) => {
        if (opts['json'] || options.quiet)
            return;
        spinner.text = chalk_1.default.cyan(msg);
    };
    let exitCode = 0;
    try {
        const report = await (0, auditor_1.runAudit)(options, progressLog);
        if (!opts['json'] && !options.quiet) {
            spinner.succeed(chalk_1.default.green(`Audit complete in ${report.durationMs < 1000 ? report.durationMs + 'ms' : (report.durationMs / 1000).toFixed(1) + 's'}`));
            console.log();
        }
        // Generate outputs
        const absPath = options.path;
        if (outputFormats.includes('terminal') && !opts['json']) {
            (0, terminal_1.printReport)(report);
        }
        if (outputFormats.includes('markdown')) {
            const mdPath = path_1.default.join(absPath, 'audit-report.md');
            (0, markdown_1.generateMarkdownReport)(report, mdPath);
            if (!opts['json'] && !options.quiet) {
                console.log(chalk_1.default.gray(`  📄 Markdown report → ${mdPath}`));
            }
        }
        if (outputFormats.includes('html')) {
            const htmlPath = path_1.default.join(absPath, 'audit-report.html');
            (0, html_1.generateHtmlReport)(report, htmlPath);
            if (!opts['json'] && !options.quiet) {
                console.log(chalk_1.default.gray(`  🌐 HTML report    → ${htmlPath}`));
            }
        }
        if (outputFormats.includes('json') || opts['json']) {
            if (opts['json']) {
                process.stdout.write(JSON.stringify(report, null, 2) + '\n');
            }
            else {
                const jsonPath = path_1.default.join(absPath, 'audit-report.json');
                (0, json_1.generateJsonReport)(report, jsonPath);
                if (!options.quiet) {
                    console.log(chalk_1.default.gray(`  📦 JSON report    → ${jsonPath}`));
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
    }
    catch (err) {
        spinner.fail(chalk_1.default.red('Audit failed'));
        console.error(chalk_1.default.red('\n  Error: ') + (err instanceof Error ? err.message : String(err)));
        console.error(chalk_1.default.gray('\n  Try running with --no-ai if you don\'t have an API key.'));
        exitCode = 2;
    }
    process.exit(exitCode);
}
main().catch(err => {
    console.error(err);
    process.exit(2);
});
//# sourceMappingURL=index.js.map