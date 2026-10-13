<h1 align="center">claude-audit</h1>

<p align="center">
  A command-line code auditor: fast static checks,<br>
  plus an optional audit where Claude investigates the code with read-only tools.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-audit"><img alt="npm" src="https://img.shields.io/npm/v/claude-audit"></a>
  <a href="https://github.com/itsmesherry/claude-audit/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itsmesherry/claude-audit/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/claude-audit"><img alt="Node" src="https://img.shields.io/node/v/claude-audit"></a>
  <a href="https://www.npmjs.com/package/claude-audit"><img alt="Downloads" src="https://img.shields.io/npm/dm/claude-audit"></a>
  <a href="https://github.com/itsmesherry/claude-audit/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue"></a>
</p>

<p align="center">
  <img src="media/demo.gif" alt="claude-audit --static run on a sample project" width="800" />
</p>

It scores a project per category and lists each finding with its file, line and a suggested fix. Reports come out in the terminal, and as Markdown, HTML or JSON. Without an API key it runs the static checks only, and nothing leaves your machine.

## Usage

```bash
# Static checks only. No API key, nothing leaves your machine.
npx claude-audit --static

# Full audit: static checks, then Claude investigates the project.
ANTHROPIC_API_KEY=sk-ant-... npx claude-audit ./path/to/project
```

Node 18 or newer. To install it instead of using `npx`: `npm install -g claude-audit`.

Report files are written to `.claude-audit/` in the audited project, so add that directory to your `.gitignore`.

## What it checks

There are three modes.

| Mode | How to run it | What happens |
|------|---------------|--------------|
| Static | `--static`, or no API key | Pattern-based rules only. Runs in milliseconds, offline. |
| Agentic | the default with an API key | Claude gets read-only tools (list files, search, read a file) and decides what to look at. Slower and costs tokens, but findings cite the code they are based on. |
| One-shot | `--fast` | One API call with a digest of the project. Cheaper than agentic, shallower. |

The static rules cover:

- **Security:** hardcoded API keys, passwords, JWT secrets, AWS, GitHub, Anthropic and OpenAI keys, private key blocks, database URLs with credentials, `eval()`, SQL built by string concatenation, `dangerouslySetInnerHTML`, disabled TLS verification, `shell=True`, `Math.random()` used for security.
- **Dependencies:** a small built-in list of known-vulnerable and deprecated packages (lodash, axios, minimist, moment, request and a few more), and very large dependency counts.
- **Quality, testing, documentation:** very long files, deep nesting, debug output left in shipped code, duplicate imports, missing tests, large undocumented files.

Performance and architecture have no static rules. They are only scored when the AI audit runs.

With an API key, Claude reviews all seven categories: security, quality, performance, architecture, dependencies, testing and documentation.

### What it is not

The static rules are regular expressions. They catch common mistakes quickly, and they also produce false positives, for example `eval(` inside a comment. The dependency list is short and hand-maintained, so it is no replacement for `npm audit` or a real vulnerability scanner. The AI audit is a second opinion from a model, with the usual caveat that it can be wrong. Known gaps are listed in [TODO.md](TODO.md).

## Sample output

From `npx claude-audit --static examples/shop-api` (the sample project is in this repository):

```
  shop-api  examples/shop-api
  5 files, 64 lines · JSON, JavaScript, Express · static analysis only

   CRITICAL  Hardcoded JWT Secret  src/config.js:5
             jwt_secret: "************",
             fix: Use a randomly generated 256-bit secret stored in environment variables.

   HIGH      Database Connection String with Credentials  src/config.js:6
             databaseUrl: "************",
             fix: Use environment variable: DATABASE_URL=... and read via process.env.DATABASE_URL

   HIGH      SQL String Concatenation (Injection Risk)  src/db.js:7
             const result = await pool.query("SELECT * FROM users WHERE email = '" + email + "'");
             fix: Use parameterized queries or an ORM. Never concatenate user input into SQL strings.

   HIGH      eval() Usage  src/routes/users.js:14
             const result = eval(req.body.expression);
             fix: Avoid eval(). Use JSON.parse() for JSON, or restructure to avoid dynamic code execution.

   HIGH      Vulnerable Dependency: lodash
             lodash@4.17.15 — Prototype pollution CVE-2021-23337
             fix: Upgrade to lodash@4.17.21 or later

  Security       ██████░░░░░░░░░░░░░░   30  F  4 findings
  Quality        ████████████████░░░░   80  B
  Dependencies   ██████████████░░░░░░   70  C  1 finding
  Testing        ████████████████░░░░   80  B
  Documentation  ████████████████░░░░   80  B

  Score 61/100 (C)  1 critical, 4 high, 0 medium, 0 low · 16ms
```

Secrets are masked in every report.

## Options

```
Usage: claude-audit [options] [path]

  path                      Project to audit (default: ".")

  -k, --api-key <key>       Anthropic API key (or set ANTHROPIC_API_KEY)
  -m, --model <model>       Claude model (default: "claude-sonnet-5-5")
  --static                  Static analysis only
  --fast                    One-shot AI mode instead of the agentic audit
  -c, --categories <list>   Only these categories, comma-separated
  -o, --output <formats>    terminal, markdown, html, json (default: "terminal,markdown,html")
  --output-dir <dir>        Where report files go (default: .claude-audit/)
  --json                    Print the JSON report to stdout and nothing else
  --max-files <n>           Maximum files to scan (default: 500)
  --max-file-size <kb>      Skip files larger than this (default: 100)
  --max-turns <n>           Agentic mode: maximum tool-use turns (default: 25)
  --max-budget <tokens>     Agentic mode: token ceiling, cached tokens included (default: 500000)
  --no-trace                Agentic mode: do not write agent-trace.jsonl
  -V, --verbose             Agentic mode: show token use and tool results per turn
  -q, --quiet               No progress output
  -v, --version             Print the version
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | No critical findings |
| `1` | At least one critical finding |
| `2` | The audit could not run, or an option had an unknown value |

If the AI step fails or runs out of budget, the report falls back to the static results. It says so in a warning on stderr and in the `warnings` field of the JSON report, and `aiPowered` is `false`.

## The agentic audit

Claude works through a fixed set of read-only tools: `get_project_summary`, `get_static_findings`, `read_dependency_manifest`, `list_files`, `search_code`, `read_file`, and `finalize_audit` to submit the result. The limits around it:

- Every path is checked against the project root. `..`, absolute paths, and symlinks that lead outside the project are refused.
- No tool can write files, run commands or reach the network.
- A run stops after `--max-turns` turns or `--max-budget` tokens, or when Claude keeps repeating the same tool call.
- A tool result is capped at 16 KB and a file read at 200 KB.
- Every tool call is recorded in `.claude-audit/agent-trace.jsonl` (turn, input, a preview of the output, duration), unless you pass `--no-trace`.

Your code is sent to the Anthropic API in the two AI modes. It is not sent anywhere in `--static` mode.

## CI

As a GitHub Action:

```yaml
- uses: itsmesherry/claude-audit@v0
  with:
    api-key: ${{ secrets.ANTHROPIC_API_KEY }}   # optional; static only without it
    fail-on-critical: true
```

The action sets the outputs `score`, `grade`, `critical-count`, `high-count`, `total-findings` and `report-json`, and adds a summary table to the workflow run. `@v0` follows the latest 0.x release; pin a full version such as `@v0.3.0` if you prefer.

Or call the CLI yourself:

```yaml
- run: npx claude-audit --static --json > audit.json
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## License

MIT © [Shehryar Sohail](https://github.com/itsmesherry)
