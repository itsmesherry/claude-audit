<div align="center">

```
   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗
  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝
  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  
  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  
  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝╚══════╝
           ██████╗ ██╗   ██╗██████╗ ██╗████████╗
           ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝
           ███████║██║   ██║██║  ██║██║   ██║   
           ██╔══██║██║   ██║██║  ██║██║   ██║   
           ██║  ██║╚██████╔╝██████╔╝██║   ██║   
           ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝   
```

**AI-Powered Codebase Auditor**

*One command. Complete audit. Powered by Claude.*

[![npm version](https://img.shields.io/npm/v/claude-audit?color=06b6d4&style=flat-square)](https://www.npmjs.com/package/claude-audit)
[![npm downloads](https://img.shields.io/npm/dm/claude-audit?color=4ade80&style=flat-square)](https://www.npmjs.com/package/claude-audit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen?style=flat-square)](https://nodejs.org)
[![Powered by Claude](https://img.shields.io/badge/Powered%20by-Claude%20AI-blueviolet?style=flat-square)](https://anthropic.com)

</div>

---

## What is Claude Audit?

**Claude Audit** is a zero-config, AI-powered codebase auditor that runs like `npx claude-audit` and gives you the kind of comprehensive audit report that would cost thousands from a consulting firm — in under 60 seconds.

It combines **static analysis** (fast, no API key needed) with **Claude AI's deep reasoning** to surface real, actionable issues across 7 dimensions:

| Category | What It Checks |
|----------|---------------|
| 🔒 **Security** | Hardcoded secrets, SQL injection, XSS, vulnerable auth patterns, OWASP Top 10 |
| 📊 **Code Quality** | Complexity, duplication, naming, dead code, anti-patterns |
| ⚡ **Performance** | N+1 queries, memory leaks, inefficient algorithms, blocking I/O |
| 🏗️ **Architecture** | Modularity, separation of concerns, coupling, scalability |
| 📦 **Dependencies** | Known CVEs, deprecated packages, bloat, supply chain risks |
| 🧪 **Testing** | Coverage gaps, missing tests, test quality, flaky patterns |
| 📚 **Documentation** | Missing docs, stale comments, API documentation gaps |

---

## Quick Start

```bash
# Zero install — just run it
npx claude-audit

# With AI-powered analysis (recommended)
ANTHROPIC_API_KEY=sk-ant-... npx claude-audit

# Specific project path
npx claude-audit ./path/to/project

# Output to HTML + Markdown reports
npx claude-audit --output terminal,html,markdown

# CI/CD mode — JSON output, exits 1 on critical issues
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

### 🤖 Dual-Mode Analysis
- **Static Mode** (no API key): Fast regex + AST-based analysis. Works offline.
- **AI Mode** (requires `ANTHROPIC_API_KEY`): Claude reads your actual code and provides senior-engineer-level insights with specific file/line references.

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

# Specific categories only
claude-audit --categories security,dependencies

# Control scope
claude-audit --max-files 1000 --max-file-size 200

# Use a specific Claude model
claude-audit --model claude-opus-4-6
```

### ⚙️ CI/CD Integration

**GitHub Actions:**
```yaml
- name: Run Claude Audit
  run: npx claude-audit --json > audit.json
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Fail on critical issues
  run: npx claude-audit --static  # exits 1 if critical issues found
```

**Pre-commit hook:**
```bash
#!/bin/sh
npx claude-audit --static --quiet --output json | \
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
- Packages with known CVEs (lodash, axios, minimist, etc.)
- Deprecated/unmaintained packages (moment, request)
- Excessive dependency count
- Missing lock files

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
│  • Secret detection (20+ rules) │
│  • Dependency vulnerability DB  │
│  • Complexity & quality checks  │
└─────────────────────────────────┘
     │
     ▼ (if ANTHROPIC_API_KEY set)
┌─────────────────────────────────┐
│       Claude AI Analysis        │
│  • Reads your actual code       │
│  • 7-category deep analysis     │
│  • Scores each category 0-100   │
│  • Specific, actionable fixes   │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│         Report Generator        │
│  • Terminal (colored)           │
│  • audit-report.md              │
│  • audit-report.html            │
│  • audit-report.json            │
└─────────────────────────────────┘
```

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
  path                    Path to the project to audit (default: ".")

Options:
  -v, --version           Output version
  -k, --api-key <key>     Anthropic API key (or set ANTHROPIC_API_KEY)
  -o, --output <formats>  Output formats: terminal,markdown,html,json (default: "terminal,markdown,html")
  -c, --categories <cats> Audit specific categories only
  -m, --model <model>     Claude model (default: "claude-sonnet-4-6")
  --max-files <n>         Max files to scan (default: 500)
  --max-file-size <kb>    Max file size in KB (default: 100)
  --static                 Static analysis only (no AI)
  -q, --quiet             Suppress progress output
  --json                  Output JSON to stdout (CI/CD mode)
  -h, --help              Display help
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Audit passed — no critical issues |
| `1` | Critical security issues found |
| `2` | Audit failed (error) |

---

## Contributing

```bash
git clone https://github.com/itsmesherry/claude-audit
cd claude-audit
npm install
npm run dev -- ./some-project   # test against a project
npm run build                   # compile TypeScript
```

Contributions welcome! Please open an issue first for major changes.

---

## License

MIT © [Shehryar Sohail](https://github.com/itsmesherry)

---

<div align="center">

**Built with ❤️ using Claude AI · [Report an Issue](https://github.com/itsmesherry/claude-audit/issues) · [Star on GitHub ⭐](https://github.com/itsmesherry/claude-audit)**

</div>
