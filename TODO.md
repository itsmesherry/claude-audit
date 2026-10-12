# claude-audit — TODO

## 1. Fix theme mismatch between HTML report and terminal output
- `.claude-audit/audit-report.html` does not match the warm amber palette used in the terminal reporter (`src/reporters/terminal.ts`).
- Align the HTML report's colours, typography, and section styling with the terminal theme (amber primary `#D97757`, bright `#E8A87C`, deep `#B85C38`, glow `#F4A261`, cream `#F4E5D3`, tan `#A67B5B`, ember `#C44536`).
- Ensure consistent visual language across terminal, markdown, and HTML outputs.

## 2. Self-audit: run claude-audit on this codebase and fix what it flags
- Run the agentic audit against the repo itself: `node dist/index.js . --verbose`.
- Triage findings by severity (critical → high → medium → low).
- Fix legitimate issues; document intentional exceptions in code or README.
- Re-run to confirm the score improves and no new regressions are introduced.

## 3. Enhance the HTML report UI
- Current `.claude-audit/audit-report.html` looks dated/ugly — redesign for a polished, modern aesthetic.
- Improvements to consider:
  - Proper typography scale, spacing rhythm, and visual hierarchy.
  - Clean cards for each category with severity-coded accents.
  - Sticky summary header with overall score + grade ring.
  - Collapsible finding details with code snippets (syntax highlighted).
  - Agent-trace panel when `agentTrace` is present (turns, tool usage, cache %).
  - Responsive layout (mobile-friendly).
  - Dark-mode friendly by default, matching the amber terminal theme.

## 4. Static analysis accuracy
- A project with no findings scores 80/B in `--static` mode, because the categories only AI can judge get a fixed placeholder score. Score only the categories that were analysed.
- `eval(` and similar rules match inside strings and comments.
- "Deep nesting" counts braces, so object literals and JSX trigger it.
- Dotfiles such as `.env` are never scanned, which is where real secrets usually are.
- Directories named `cache`, `target`, `out` or `env` are skipped anywhere in the tree, even when they hold source code.
- The vulnerable-dependency list is a small hardcoded table. Use the OSV API (or `npm audit` / `pip-audit` output) instead.
- Flag a dependency manifest with no lock file.

## 5. Agent and SDK
- Upgrade `@anthropic-ai/sdk` (currently 0.39) and re-test thinking and tool use on current models.
- Cache the growing conversation, not only the system prompt and tool definitions, to cut cost on long audits.
- `braces` (via `fast-glob`) has an open denial-of-service advisory with no fix yet; update when one ships.

## 6. Project
- Add ESLint to CI.
- Remove the unused metrics in `src/analyzers/static/complexity.ts` (`longFunctions`, `longLines`, `todoCount`) or report them.
