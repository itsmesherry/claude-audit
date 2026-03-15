// ─────────────────────────────────────────────
//  claude-audit — HTML Reporter
// ─────────────────────────────────────────────

import fs from 'fs';
import type { AuditReport, CategoryScore, Finding, AuditCategory } from '../core/types';

const CAT_ICONS: Record<AuditCategory, string> = {
  security: '🔒',
  quality: '📊',
  performance: '⚡',
  architecture: '🏗️',
  dependencies: '📦',
  testing: '🧪',
  documentation: '📚',
};

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function scoreColor(score: number): string {
  if (score >= 80) return '#4ade80';
  if (score >= 60) return '#facc15';
  return '#f87171';
}

function severityColor(sev: string): string {
  return { critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#60a5fa', info: '#9ca3af' }[sev] ?? '#fff';
}

export function generateHtmlReport(report: AuditReport, outputPath: string): void {
  const { project, overallScore, overallGrade, categories, allFindings } = report;
  const date = new Date(report.timestamp).toLocaleString();

  const categoryCards = categories.map(cat => {
    const findings = cat.findings.map(f => `
      <div class="finding">
        <div class="finding-header">
          <span class="sev-badge" style="background:${severityColor(f.severity)}">${esc(f.severity.toUpperCase())}</span>
          <strong>${esc(f.title)}</strong>
        </div>
        <p class="finding-desc">${esc(f.description)}</p>
        ${f.file ? `<div class="finding-file">📄 <code>${esc(f.file)}${f.line ? ':' + f.line : ''}</code></div>` : ''}
        ${f.snippet ? `<pre class="snippet">${esc(f.snippet)}</pre>` : ''}
        ${f.fix ? `<div class="finding-fix">✅ <strong>Fix:</strong> ${esc(f.fix)}</div>` : ''}
      </div>`).join('');

    return `
    <div class="cat-card">
      <div class="cat-header">
        <div class="cat-title">
          <span class="cat-icon">${CAT_ICONS[cat.category] ?? ''}</span>
          <h3>${esc(cat.category.charAt(0).toUpperCase() + cat.category.slice(1))}</h3>
        </div>
        <div class="cat-score">
          <div class="score-circle" style="--score:${cat.score};--color:${scoreColor(cat.score)}">
            <span>${cat.score}</span>
          </div>
          <span class="grade" style="color:${scoreColor(cat.score)}">${cat.grade}</span>
        </div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-fill" style="width:${cat.score}%;background:${scoreColor(cat.score)}"></div>
      </div>
      ${cat.summary ? `<p class="cat-summary">${esc(cat.summary)}</p>` : ''}
      ${cat.findings.length > 0 ? `<div class="findings-list">${findings}</div>` : '<p class="clean">✅ No issues found</p>'}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Claude Audit — ${esc(project.name)}</title>
<style>
  :root {
    --bg: #0f1117; --surface: #1a1d27; --surface2: #21263a;
    --border: #2d3348; --text: #e2e8f0; --muted: #6b7280;
    --cyan: #06b6d4; --green: #4ade80; --yellow: #facc15; --red: #f87171;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; }
  a { color: var(--cyan); }
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem 1.5rem; }

  /* Header */
  .header { text-align: center; padding: 3rem 0 2rem; border-bottom: 1px solid var(--border); margin-bottom: 2rem; }
  .header .logo { font-size: 2rem; font-weight: 900; letter-spacing: -1px; }
  .header .logo span { color: var(--cyan); }
  .header .subtitle { color: var(--muted); margin-top: 0.5rem; }

  /* Overview grid */
  .overview { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem; }
  @media (max-width: 700px) { .overview { grid-template-columns: 1fr; } }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
  .card h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 1rem; }

  /* Score circle */
  .big-score { text-align: center; }
  .score-ring { width: 120px; height: 120px; margin: 0 auto 1rem; position: relative; }
  .score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .score-ring circle { fill: none; stroke-width: 8; }
  .score-ring .bg { stroke: var(--border); }
  .score-ring .fg { stroke-dasharray: 339; stroke-dashoffset: calc(339 - (339 * var(--score) / 100)); stroke-linecap: round; transition: stroke-dashoffset 1s ease; }
  .score-number { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; }
  .score-number .num { font-size: 2rem; font-weight: 900; }
  .score-number .label { font-size: 0.7rem; color: var(--muted); }
  .grade-badge { display: inline-block; padding: 0.3rem 1.2rem; border-radius: 999px; font-size: 1.5rem; font-weight: 900; margin-top: 0.5rem; }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .stat-item { background: var(--surface2); border-radius: 8px; padding: 0.75rem 1rem; }
  .stat-item .count { font-size: 1.5rem; font-weight: 700; }
  .stat-item .slabel { font-size: 0.75rem; color: var(--muted); }

  /* Project info */
  .info-table { width: 100%; border-collapse: collapse; }
  .info-table td { padding: 0.4rem 0; vertical-align: top; }
  .info-table td:first-child { color: var(--muted); width: 40%; font-size: 0.85rem; }
  .info-table td:last-child { font-size: 0.85rem; }

  /* Category cards */
  .categories { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  @media (max-width: 700px) { .categories { grid-template-columns: 1fr; } }

  .cat-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
  .cat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .cat-title { display: flex; align-items: center; gap: 0.5rem; }
  .cat-icon { font-size: 1.25rem; }
  .cat-title h3 { font-size: 1rem; font-weight: 600; }
  .cat-score { display: flex; align-items: center; gap: 0.5rem; }
  .score-circle { width: 44px; height: 44px; border-radius: 50%; background: conic-gradient(var(--color) calc(var(--score) * 1%), var(--border) 0); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; }
  .grade { font-weight: 900; font-size: 1.1rem; }
  .score-bar-wrap { height: 6px; background: var(--border); border-radius: 999px; overflow: hidden; margin-bottom: 1rem; }
  .score-bar-fill { height: 100%; border-radius: 999px; }
  .cat-summary { font-size: 0.85rem; color: var(--muted); margin-bottom: 1rem; }
  .clean { color: var(--green); font-size: 0.9rem; }

  /* Findings */
  .findings-list { display: flex; flex-direction: column; gap: 0.75rem; }
  .finding { background: var(--surface2); border-radius: 8px; padding: 1rem; border-left: 3px solid var(--border); }
  .finding-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
  .sev-badge { font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px; color: #000; }
  .finding-desc { font-size: 0.85rem; color: var(--muted); margin-bottom: 0.5rem; }
  .finding-file { font-size: 0.8rem; color: var(--cyan); margin-bottom: 0.4rem; }
  .snippet { font-size: 0.75rem; background: #0d0f18; padding: 0.5rem 0.75rem; border-radius: 6px; overflow-x: auto; color: #a5b4fc; margin-bottom: 0.4rem; font-family: 'Fira Code', monospace; }
  .finding-fix { font-size: 0.82rem; color: var(--green); }

  /* Footer */
  .footer { text-align: center; padding: 2rem 0; color: var(--muted); font-size: 0.85rem; margin-top: 2rem; border-top: 1px solid var(--border); }

  /* Section title */
  .section-title { font-size: 1.25rem; font-weight: 700; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }
</style>
</head>
<body>
<div class="container">

  <div class="header">
    <div class="logo"><span>Claude</span> Audit</div>
    <div class="subtitle">AI-Powered Codebase Audit Report · ${esc(date)}</div>
  </div>

  <div class="overview">
    <div class="card big-score">
      <h2>Overall Score</h2>
      <div class="score-ring" style="--score:${overallScore}">
        <svg viewBox="0 0 120 120">
          <circle class="bg" cx="60" cy="60" r="54"/>
          <circle class="fg" cx="60" cy="60" r="54" style="stroke:${scoreColor(overallScore)};stroke-dasharray:339;stroke-dashoffset:${339 - (339 * overallScore / 100)}"/>
        </svg>
        <div class="score-number">
          <span class="num" style="color:${scoreColor(overallScore)}">${overallScore}</span>
          <span class="label">/ 100</span>
        </div>
      </div>
      <div class="grade-badge" style="background:${scoreColor(overallScore)}22;color:${scoreColor(overallScore)}">${overallGrade}</div>
    </div>

    <div class="card">
      <h2>Findings Breakdown</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="count" style="color:#ef4444">${report.criticalCount}</div>
          <div class="slabel">🔴 Critical</div>
        </div>
        <div class="stat-item">
          <div class="count" style="color:#f97316">${report.highCount}</div>
          <div class="slabel">🟠 High</div>
        </div>
        <div class="stat-item">
          <div class="count" style="color:#eab308">${report.mediumCount}</div>
          <div class="slabel">🟡 Medium</div>
        </div>
        <div class="stat-item">
          <div class="count" style="color:#60a5fa">${report.lowCount}</div>
          <div class="slabel">🔵 Low</div>
        </div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:2rem">
    <h2>Project Info</h2>
    <table class="info-table">
      <tr><td>Project</td><td><strong>${esc(project.name)}</strong></td></tr>
      <tr><td>Languages</td><td>${esc(Object.entries(project.languages).map(([l, c]) => `${l} (${c})`).join(', '))}</td></tr>
      ${project.frameworks.length ? `<tr><td>Frameworks</td><td>${esc(project.frameworks.join(', '))}</td></tr>` : ''}
      <tr><td>Files Scanned</td><td>${project.totalFiles.toLocaleString()}</td></tr>
      <tr><td>Lines of Code</td><td>${project.totalLines.toLocaleString()}</td></tr>
      <tr><td>Tests</td><td>${project.hasTests ? '✅ Yes' : '❌ No'}</td></tr>
      ${project.packageManager ? `<tr><td>Package Manager</td><td>${esc(project.packageManager)}</td></tr>` : ''}
      <tr><td>Analysis</td><td>${report.aiPowered ? '✦ AI-Powered (Claude)' : '⚡ Static Only'}</td></tr>
    </table>
  </div>

  <div class="section-title">📈 Category Results</div>
  <div class="categories">
    ${categoryCards}
  </div>

  <div class="footer">
    Generated by <a href="https://github.com/itsmesherry/claude-audit">claude-audit</a> · AI-powered codebase auditor
  </div>
</div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}
