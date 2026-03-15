"use strict";
// ─────────────────────────────────────────────
//  claude-audit — Terminal Reporter
// ─────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printBanner = printBanner;
exports.printReport = printReport;
const chalk_1 = __importDefault(require("chalk"));
const boxen_1 = __importDefault(require("boxen"));
const CATEGORY_ICONS = {
    security: '🔒',
    quality: '📊',
    performance: '⚡',
    architecture: '🏗️ ',
    dependencies: '📦',
    testing: '🧪',
    documentation: '📚',
};
const SEVERITY_COLOR = {
    critical: chalk_1.default.bgRed.white.bold,
    high: chalk_1.default.red.bold,
    medium: chalk_1.default.yellow.bold,
    low: chalk_1.default.cyan,
    info: chalk_1.default.gray,
};
const SEVERITY_LABEL = {
    critical: ' CRITICAL ',
    high: '  HIGH    ',
    medium: '  MEDIUM  ',
    low: '   LOW    ',
    info: '   INFO   ',
};
const GRADE_COLOR = {
    A: chalk_1.default.greenBright.bold,
    B: chalk_1.default.green.bold,
    C: chalk_1.default.yellow.bold,
    D: chalk_1.default.red,
    F: chalk_1.default.bgRed.white.bold,
};
function scoreBar(score, width = 20) {
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    const color = score >= 80 ? chalk_1.default.green : score >= 60 ? chalk_1.default.yellow : chalk_1.default.red;
    return color('█'.repeat(filled)) + chalk_1.default.gray('░'.repeat(empty));
}
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}
function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function printBanner() {
    const banner = [
        chalk_1.default.cyan.bold('   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗'),
        chalk_1.default.cyan.bold('  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝'),
        chalk_1.default.cyan.bold('  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  '),
        chalk_1.default.cyan.bold('  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  '),
        chalk_1.default.cyan.bold('  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗'),
        chalk_1.default.cyan.bold('   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚══════╝'),
        '',
        chalk_1.default.white.bold('         ██████╗ ██╗   ██╗██████╗ ██╗████████╗'),
        chalk_1.default.white.bold('         ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝'),
        chalk_1.default.white.bold('         ███████║██║   ██║██║  ██║██║   ██║   '),
        chalk_1.default.white.bold('         ██╔══██║██║   ██║██║  ██║██║   ██║   '),
        chalk_1.default.white.bold('         ██║  ██║╚██████╔╝██████╔╝██║   ██║   '),
        chalk_1.default.white.bold('         ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   '),
        '',
        chalk_1.default.gray('     AI-Powered Codebase Auditor  ·  v1.0.0'),
        chalk_1.default.gray('     github.com/shehryar/claude-audit'),
    ].join('\n');
    console.log((0, boxen_1.default)(banner, {
        padding: 1,
        borderStyle: 'double',
        borderColor: 'cyan',
    }));
    console.log();
}
function printReport(report) {
    const { project, overallScore, overallGrade, categories, allFindings } = report;
    // ── Header ────────────────────────────────────────────
    const gradeColor = GRADE_COLOR[overallGrade] ?? chalk_1.default.white;
    const scoreColor = overallScore >= 80 ? chalk_1.default.greenBright : overallScore >= 60 ? chalk_1.default.yellow : chalk_1.default.red;
    const headerContent = [
        chalk_1.default.white.bold(`  Project: ${chalk_1.default.cyan(project.name)}`),
        chalk_1.default.white(`  Path:    ${chalk_1.default.gray(project.path)}`),
        chalk_1.default.white(`  Scanned: ${chalk_1.default.cyan(project.totalFiles + ' files')} · ${chalk_1.default.cyan(project.totalLines.toLocaleString() + ' lines')}`),
        chalk_1.default.white(`  Stack:   ${chalk_1.default.cyan(Object.keys(project.languages).join(', ') || 'Unknown')}`),
        project.frameworks.length > 0
            ? chalk_1.default.white(`  Frameworks: ${chalk_1.default.cyan(project.frameworks.join(', '))}`)
            : '',
        '',
        chalk_1.default.white('  ┌────────────────────────────────────┐'),
        chalk_1.default.white('  │') +
            '   OVERALL SCORE: ' + scoreColor.bold(overallScore + '/100') +
            '  Grade: ' + gradeColor(overallGrade) +
            chalk_1.default.white('   │'),
        chalk_1.default.white('  └────────────────────────────────────┘'),
        '',
        chalk_1.default.white('  ') + (report.aiPowered
            ? chalk_1.default.greenBright('✦ AI-Powered Analysis (Claude)')
            : chalk_1.default.yellow('⚡ Static Analysis Mode')),
        chalk_1.default.white('  ') + chalk_1.default.gray(`Duration: ${formatDuration(report.durationMs)} · ${new Date(report.timestamp).toLocaleString()}`),
    ].filter(l => l !== '').join('\n');
    console.log((0, boxen_1.default)(headerContent, {
        padding: { top: 0, bottom: 0, left: 1, right: 2 },
        borderStyle: 'round',
        borderColor: overallScore >= 80 ? 'green' : overallScore >= 60 ? 'yellow' : 'red',
        title: ' AUDIT REPORT ',
        titleAlignment: 'center',
    }));
    console.log();
    // ── Category Scores ───────────────────────────────────
    console.log(chalk_1.default.white.bold(' CATEGORY SCORES\n'));
    for (const cat of categories) {
        const icon = CATEGORY_ICONS[cat.category] ?? '  ';
        const grade = GRADE_COLOR[cat.grade]?.(` ${cat.grade} `) ?? ` ${cat.grade} `;
        const bar = scoreBar(cat.score);
        const scoreStr = cat.score >= 80
            ? chalk_1.default.green(`${cat.score}/100`)
            : cat.score >= 60
                ? chalk_1.default.yellow(`${cat.score}/100`)
                : chalk_1.default.red(`${cat.score}/100`);
        const issueCount = cat.findings.length;
        const issueStr = issueCount > 0
            ? chalk_1.default.gray(` · ${issueCount} issue${issueCount === 1 ? '' : 's'}`)
            : chalk_1.default.gray(' · Clean');
        const label = (cat.category.charAt(0).toUpperCase() + cat.category.slice(1)).padEnd(14);
        console.log(`  ${icon}  ${chalk_1.default.white.bold(label)}  ${bar}  ${scoreStr}  ${grade}${issueStr}`);
    }
    // ── Summary Stats ─────────────────────────────────────
    console.log();
    console.log(chalk_1.default.white.bold(' FINDINGS SUMMARY\n'));
    const stats = [
        { label: '🔴 Critical', count: report.criticalCount, color: chalk_1.default.red.bold },
        { label: '🟠 High', count: report.highCount, color: chalk_1.default.red },
        { label: '🟡 Medium', count: report.mediumCount, color: chalk_1.default.yellow },
        { label: '🔵 Low', count: report.lowCount, color: chalk_1.default.cyan },
    ];
    const statLine = stats
        .map(s => `  ${s.label}: ${s.color(String(s.count))}`)
        .join('   ');
    console.log(statLine);
    // ── Findings ──────────────────────────────────────────
    if (allFindings.length === 0) {
        console.log();
        console.log(chalk_1.default.greenBright.bold('  ✓ No issues found! Excellent codebase.'));
    }
    else {
        const grouped = groupBySeverity(allFindings);
        for (const [severity, findings] of grouped) {
            if (findings.length === 0)
                continue;
            const label = SEVERITY_LABEL[severity];
            const color = SEVERITY_COLOR[severity] ?? chalk_1.default.white;
            const icon = severity === 'critical' ? '🚨' : severity === 'high' ? '⚠️ ' : severity === 'medium' ? '📋' : '💡';
            console.log();
            console.log(`\n  ${icon}  ${color(label)}  ${chalk_1.default.bold(severity.toUpperCase() + ' ISSUES')} (${findings.length})`);
            console.log(chalk_1.default.gray('  ' + '─'.repeat(70)));
            for (const finding of findings.slice(0, 20)) { // max 20 shown per severity
                printFinding(finding);
            }
            if (findings.length > 20) {
                console.log(chalk_1.default.gray(`  ... and ${findings.length - 20} more. See full report in audit-report.md`));
            }
        }
    }
    // ── Category AI Summaries ─────────────────────────────
    const summaries = categories.filter(c => c.summary && c.summary.length > 10);
    if (summaries.length > 0) {
        console.log();
        console.log(chalk_1.default.white.bold('\n  AI INSIGHTS\n'));
        for (const cat of summaries) {
            const icon = CATEGORY_ICONS[cat.category] ?? '';
            console.log(`  ${icon}  ${chalk_1.default.bold(cat.category.toUpperCase())}`);
            console.log(`  ${chalk_1.default.gray(cat.summary)}`);
            console.log();
        }
    }
    // ── Footer ────────────────────────────────────────────
    console.log(chalk_1.default.gray('  ' + '─'.repeat(70)));
    console.log();
    if (report.criticalCount > 0) {
        console.log(chalk_1.default.red.bold('  ⛔ ' + report.criticalCount + ' CRITICAL issue(s) require immediate attention!'));
    }
    else if (overallScore >= 90) {
        console.log(chalk_1.default.greenBright.bold('  🎉 Excellent! Your codebase is in great shape.'));
    }
    else if (overallScore >= 70) {
        console.log(chalk_1.default.yellow.bold('  👍 Good codebase. Address the flagged issues to level up.'));
    }
    else {
        console.log(chalk_1.default.red.bold('  🛠  Significant work needed. Start with critical and high severity issues.'));
    }
    console.log();
}
function printFinding(f) {
    const severity = SEVERITY_COLOR[f.severity] ?? chalk_1.default.white;
    const icon = CATEGORY_ICONS[f.category] ?? '';
    console.log();
    console.log(`    ${icon} ${chalk_1.default.white.bold(f.title)}`);
    console.log(`    ${chalk_1.default.gray(truncate(f.description, 100))}`);
    if (f.file) {
        const loc = f.line ? `${f.file}:${f.line}` : f.file;
        console.log(`    ${chalk_1.default.dim('File:')} ${chalk_1.default.cyan(loc)}`);
    }
    if (f.snippet) {
        console.log(`    ${chalk_1.default.dim('Code:')} ${chalk_1.default.gray.italic(truncate(f.snippet, 90))}`);
    }
    if (f.fix) {
        console.log(`    ${chalk_1.default.dim('Fix: ')} ${chalk_1.default.greenBright(truncate(f.fix, 100))}`);
    }
}
function groupBySeverity(findings) {
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    const map = new Map();
    for (const sev of order)
        map.set(sev, []);
    for (const f of findings) {
        map.get(f.severity)?.push(f);
    }
    return map;
}
//# sourceMappingURL=terminal.js.map