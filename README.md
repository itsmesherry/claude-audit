<div align="center">

# Claude Audit

**AI-Powered Codebase Auditor**

*One command. Complete audit. Powered by Claude.*

<!-- Re-record: brew install charmbracelet/tap/vhs && vhs media/demo.tape -->
<img src="media/demo.gif" alt="claude-audit demo" width="800" />


[![npm version](https://img.shields.io/npm/v/claude-audit?color=06b6d4&style=flat-square)](https://www.npmjs.com/package/claude-audit)
[![npm downloads](https://img.shields.io/npm/dm/claude-audit?color=4ade80&style=flat-square)](https://www.npmjs.com/package/claude-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![Powered by Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-blueviolet?style=flat-square)](https://anthropic.com)

</div>

---

## What is Claude Audit?

**Claude Audit** is a zero-config, AI-powered codebase auditor that runs like `npx claude-audit` and gives you the kind of comprehensive audit report that would cost thousands from a consulting firm.

It combines **static analysis** (fast, no API key needed), **one-shot AI review**, and a true **agentic audit loop** where Claude actively investigates your codebase — reading files, searching for patterns, and verifying every finding with evidence — across 7 dimensions:

| Category | What It Checks |
|----------|---------------|
| 🔒 **Security** | Hardcoded secrets, SQL injection, XSS, vulnerable auth patterns, OWASP Top 10 |
| 📊 **Code Quality** | Complexity, duplication, naming, dead code, anti-patterns |
| ⚡ **Performance** | N+1 queries, memory leaks, inefficient algorithms, blocking I/O |
| 🏗️ **Architecture** | Modularity, separation of concerns, coupling, scalability |
| 📦 **Dependencies** | Known-vulnerable and deprecated packages, bloat, supply chain risks |
| 🧪 **Testing** | Coverage gaps, missing tests, test quality, flaky patterns |
| 📚 **Documentation** | Missing docs, stale comments, API documentation gaps |

---

## Quick Start

```bash
# Zero install — just run it (agentic audit when API key is set)
ANTHROPIC_API_KEY=sk-ant-... npx claude-audit

# Static only — no API key required
npx claude-audit --static

# Specific project path
npx claude-audit ./path/to/project

# One-shot AI mode — cheaper & faster, shallower than agentic
npx claude-audit --fast

# Control the agent budget
npx claude-audit --max-turns 40 --max-budget 1000000

# Output to HTML + Markdown reports
npx claude-audit --output terminal,html,markdown

# CI/CD mode — JSON on stdout, exits 1 on critical issues
npx claude-audit --json
```

---

## Installation

```bash
# Global install
npm install -g claude-audit

# Then use anywhere
claude-audit
claude-audit ./my-project
```

---

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗       ║
║   ...                                                    ║
║   AI-Powered Codebase Auditor  ·  v1.0.0                 ║
╚══════════════════════════════════════════════════════════╝

╭─────────────────────────────── AUDIT REPORT ─────────────────────────────────╮
│  Project: my-saas-app                                                        │
│  Path:    /Users/dev/my-saas-app                                             │
│  Scanned: 247 files · 18,432 lines                                          │
│  Stack:   TypeScript, Python                                                 │
│  Frameworks: React, FastAPI, Prisma                                          │
│                                                                              │
│  ┌────────────────────────────────────┐                                     │
│  │   OVERALL SCORE: 64/100  Grade: C  │                                     │
│  └────────────────────────────────────┘                                     │
│                                                                              │
│  ✦ AI-Powered Analysis (Claude)  ·  Duration: 12.4s                         │
╰──────────────────────────────────────────────────────────────────────────────╯

 CATEGORY SCORES

  🔒  Security        ██████░░░░░░░░░░░░░░  42/100  [ D ]  · 3 issues
  📊  Code Quality    ████████████░░░░░░░░  71/100  [ C ]  · 5 issues
  ⚡  Performance     █████████████░░░░░░░  78/100  [ C ]  · 2 issues
  🏗️   Architecture    ██████████░░░░░░░░░░  60/100  [ D ]  · 4 issues
  📦  Dependencies    ████████░░░░░░░░░░░░  55/100  [ F ]  · 7 issues
  🧪  Testing         ████████░░░░░░░░░░░░  40/100  [ F ]  · 2 issues
  📚  Documentation   ████████████░░░░░░░░  72/100  [ C ]  · 1 issue

 FINDINGS SUMMARY

  🔴 Critical: 2      🟠 High: 4      🟡 Medium: 8      🔵 Low: 10


  🚨   CRITICAL   CRITICAL ISSUES (2)
  ──────────────────────────────────────────────────────────────────────

    🔒 Hardcoded JWT Secret
    Potential Hardcoded JWT Secret found in source code.
    File: src/config/auth.ts:14
    Code: jwt_secret = "super-secret-key-dont-tell"
    Fix:  Use a randomly generated 256-bit secret stored in environment variables.

    📦 Vulnerable Dependency: axios
    axios@0.21.0 — SSRF vulnerability in versions < 0.21.2
    Fix:  Upgrade to axios@0.21.2 or later
```

---

## Features

### 🤖 Three Analysis Modes
| Mode | Flag | When to use |
|------|------|-------------|
| **Static** | `--static` | No API key, offline, CI pre-checks. Pattern-based rules. |
| **One-shot AI** | `--fast` | Cheap & fast Claude review of a files digest. |
| **Agentic** *(default when `ANTHROPIC_API_KEY` is set)* | *(default)* | Claude actively investigates via tools — reads files, runs searches, verifies every finding with evidence. Deepest signal, highest accuracy. |

### 🧭 Agentic Audit — How it works
When an API key is available, Claude Audit runs a **manual agentic loop**: Claude is given a read-only, sandboxed tool set and orchestrates its own investigation.

**Tools Claude has access to:**
- `get_project_summary` — languages, frameworks, test setup
- `get_static_findings` — deterministic findings to build on (never duplicate)
- `read_dependency_manifest` — `package.json`, `requirements.txt`, etc.
- `list_files` — glob-based discovery
- `search_code` — literal or regex search across the repo
- `read_file` — line-range reads with numbered output
- `finalize_audit` — structured submission of findings

**Production guardrails (all enabled by default):**
- 🛡️ **Path sandboxing** — every file access is resolved against the project root; traversal (`..`), absolute-path escape, symlinks that point outside the project, and null-byte smuggling are rejected
- 🔒 **Read-only by construction** — no tool can write, spawn shells, or hit the network
- 🔁 **Repetition circuit breaker** — same tool call 3× in the last 6 calls aborts the loop before it wastes budget
- 🎯 **Iteration cap** — hard ceiling of 25 tool-use turns (configurable via `--max-turns`)
- 💰 **Token budget** — 500k-token hard ceiling per audit (configurable via `--max-budget`)
- 📉 **Prompt caching** — stable system prompt + tool defs are cached (typically 80%+ cache hit rate)
- ⏱️ **Per-turn streaming** — no SDK HTTP timeouts on long reasoning turns
- 🧯 **Errors as results** — tool failures are returned to Claude as recoverable results; the loop never crashes
- 📏 **Result size caps** — 16 KB per tool result, 200 KB per file read (Claude is told to use ranges)
- ⏳ **Budget-aware nudges** — at 70% of the budget Claude is reminded to finalise instead of over-exploring
- 🧭 **Full audit trail** — every tool call is recorded to `.claude-audit/agent-trace.jsonl` (turn, input, output preview, duration, error flag). Disable with `--no-trace`.
- 📺 **Live streaming tree view** — the CLI prints each turn and tool call as it happens (no more opaque spinner); add `-V / --verbose` for per-turn token spend, tool durations, and result previews.

**Why an agentic audit beats a one-shot one:**
| | One-shot (`--fast`) | Agentic *(default)* |
|---|---|---|
| Evidence quality | Limited to file digest sent in the prompt | Claude reads actual files, line-by-line, and verifies each finding |
| Cross-file insight | Hard — small context window | Native — Claude pulls what it needs |
| False positives | Higher (inference from partial view) | Lower (must cite file:line + snippet) |
| Cost | Lower, bounded | Higher but **capped** via `--max-budget` |
| Latency | Single API call | Multiple turns (still ~1-3 min typical) |

### 📄 Multiple Output Formats
| Format | Flag | Description |
|--------|------|-------------|
| Terminal | `--output terminal` | Beautiful colored output (default) |
| Markdown | `--output markdown` | Saves `audit-report.md` |
| HTML | `--output html` | Beautiful standalone HTML report |
| JSON | `--output json` | Machine-readable, perfect for CI/CD |

### 🔧 Highly Configurable
```bash
# Static analysis only (no AI, no API key)
claude-audit --static

# One-shot AI mode (no agentic loop, cheaper)
claude-audit --fast

# Specific categories only
claude-audit --categories security,dependencies

# Control scope
claude-audit --max-files 1000 --max-file-size 200

# Tune the agent
claude-audit --max-turns 40 --max-budget 1000000
claude-audit --no-trace          # skip agent-trace.jsonl

# Use a specific Claude model
claude-audit --model claude-opus-4-6
```

### ⚙️ CI/CD Integration

**GitHub Action (recommended):**
```yaml
- name: Claude Audit
  uses: itsmesherry/claude-audit@v0
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}  # optional
    fail-on-critical: true
```

The action outputs `score`, `grade`, `critical-count`, `high-count`, `total-findings` and `report-json` for downstream steps, and writes a summary table to the workflow run. Without an `api-key` it runs static analysis only. `@v0` follows the latest 0.x release; pin a full version such as `@v0.3.0` if you prefer.

**Manual npx usage:**
```yaml
- name: Run Claude Audit
  run: npx claude-audit --json > audit.json
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Pre-commit hook:**
```bash
#!/bin/sh
npx claude-audit --static --quiet --json | \
  node -e "const r=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.exit(r.criticalCount > 0 ? 1 : 0)"
```

---

## What Gets Audited

### 🔒 Security
- Hardcoded API keys, secrets, passwords, tokens
- AWS/GitHub/Anthropic/OpenAI credentials in source
- SQL injection patterns (string concatenation in queries)
- `eval()` usage, dangerous `innerHTML` patterns
- Disabled SSL/TLS verification
- Command injection via `subprocess(shell=True)`
- Insecure cryptographic functions (`Math.random()` for security)
- JWT secret exposure
- Database connection strings with credentials

### 📦 Dependencies
- Packages with known CVEs, from a small built-in list (lodash, axios, minimist, etc.)
- Deprecated/unmaintained packages (moment, request)
- Excessive dependency count

### 📊 Code Quality
- Files > 500 lines (consider splitting)
- Deep nesting (>5 levels)
- Excessive `console.log` usage
- Duplicate imports
- Missing documentation on large files
- Test coverage ratio

---

## How It Works

```
Your Codebase
     │
     ▼
┌─────────────────────────────────┐
│         File Scanner            │
│  • Respects .gitignore          │
│  • Detects languages/frameworks │
│  • Reads source files           │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│       Static Analyzers          │
│  • Secret detection (15 rules)  │
│  • Dependency vulnerability DB  │
│  • Complexity & quality checks  │
└─────────────────────────────────┘
     │
     ▼ (if ANTHROPIC_API_KEY set — default path)
┌─────────────────────────────────────────────────┐
│          Claude — Agentic Audit Loop            │
│                                                 │
│   ┌─────────────────────────────────────┐      │
│   │  Claude reasons → picks a tool call │◄─┐   │
│   └─────────────────────────────────────┘  │   │
│                 │                           │   │
│                 ▼                           │   │
│   ┌─────────────────────────────────────┐  │   │
│   │  Sandboxed executor runs the tool   │  │   │
│   │  (list_files / search_code /        │  │   │
│   │   read_file / ...) — read-only      │  │   │
│   └─────────────────────────────────────┘  │   │
│                 │                           │   │
│                 └───────── tool_result ─────┘   │
│                                                 │
│   Guardrails:  max-turns · max-budget ·         │
│   repetition detector · path sandbox · trace    │
│                                                 │
│   Terminates when Claude calls finalize_audit   │
└─────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│         Report Generator        │
│  • Terminal (colored)           │
│  • audit-report.md              │
│  • audit-report.html            │
│  • audit-report.json            │
│  • agent-trace.jsonl            │
└─────────────────────────────────┘
```

### Trace artifact
Every agentic audit produces `.claude-audit/agent-trace.jsonl` with one event per line:
```jsonl
{"kind":"meta","model":"claude-sonnet-4-6","maxTurns":25,"maxBudgetTokens":500000,"summary":{...}}
{"kind":"call","turn":1,"toolUseId":"toolu_...","name":"get_project_summary","input":{},"outputPreview":"...","outputBytes":342,"durationMs":2,"isError":false,"timestamp":"2026-04-23T..."}
{"kind":"call","turn":2,"toolUseId":"toolu_...","name":"search_code","input":{"pattern":"eval("},...}
...
```
Useful for debugging, cost analysis, and compliance/audit-trail requirements.

---

## Supported Languages & Ecosystems

TypeScript · JavaScript · Python · Go · Rust · Java · Kotlin · Swift ·  
C/C++ · C# · PHP · Ruby · Scala · Elixir · Haskell · Lua · R ·  
SQL · Shell · YAML · Terraform · Dockerfile · Vue · Svelte · Astro

---

## Options Reference

```
Usage: claude-audit [options] [path]

Arguments:
  path                      Path to the project to audit (default: ".")

Options:
  -v, --version             Output version
  -k, --api-key <key>       Anthropic API key (or set ANTHROPIC_API_KEY)
  -o, --output <formats>    Output formats: terminal,markdown,html,json (default: "terminal,markdown,html")
  -c, --categories <cats>   Audit specific categories only
  -m, --model <model>       Claude model (default: "claude-sonnet-4-6")
  --max-files <n>           Max files to scan (default: 500)
  --max-file-size <kb>      Max file size in KB (default: 100)
  --static                  Static analysis only (no AI)
  --fast                    One-shot AI mode (no agentic loop)
  --max-turns <n>           Agentic iteration cap (default: 25)
  --max-budget <tokens>     Agentic token ceiling (default: 500000)
  --no-trace                Don't write agent-trace.jsonl
  -V, --verbose             Show per-turn token spend, tool durations, and result previews
  --output-dir <dir>        Directory for report files (default: .claude-audit/)
  -q, --quiet               Suppress progress output
  --json                    Output JSON to stdout (CI/CD mode)
  -h, --help                Display help
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Audit passed — no critical issues |
| `1` | At least one critical finding |
| `2` | Audit failed (error), or an unknown `--output` / `--categories` value |

If the AI step fails or runs out of budget before finishing, the report falls back to static analysis only: `aiPowered` is `false`, the reason is listed in `warnings` in the JSON report, and a warning is printed to stderr. Secrets found in your code are masked in every report.

---

## Contributing

```bash
git clone https://github.com/itsmesherry/claude-audit
cd claude-audit
npm install
npm run dev -- ./some-project   # test against a project
npm run build                   # compile TypeScript
```

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, [TODO.md](TODO.md) for known gaps, and [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

---

## License

MIT © [Shehryar Sohail](https://github.com/itsmesherry)

---

<div align="center">

**Built with ❤️ using Claude AI · [Report an Issue](https://github.com/itsmesherry/claude-audit/issues) · [Star on GitHub ⭐](https://github.com/itsmesherry/claude-audit)**

</div>
