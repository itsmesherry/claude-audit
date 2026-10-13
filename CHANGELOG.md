# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The terminal report is compact: no banner, no emoji, one block per finding
  and a single summary line. The Markdown report is shorter in the same way,
  and both the Markdown and HTML reports now show warnings.
- Static-only reports score just the categories that have static rules
  (security, quality, dependencies, testing, documentation). Performance and
  architecture used to appear with a fixed 80 that nothing had measured; they
  are now left out unless the AI audit ran, so static scores can differ from
  0.3.0. Asking for one of them with `--static` gives a warning.
- A line that holds a credential is reported once, by the most specific rule,
  instead of once per matching rule.
- README rewritten, with a demo recorded from a real run on `examples/shop-api`.

### Removed

- The `boxen` dependency.

## [0.3.0] - 2026-10-13

### Security

- Secrets are now masked in every report. Before, a detected password, AWS key,
  GitHub token or database URL was often printed in full in the terminal,
  Markdown, HTML and JSON reports, and sent to Claude with the static findings.
- The agent's file tools no longer follow symlinks or `..` glob patterns out of
  the project, so a repository being audited cannot make the agent read other
  files on the machine.
- Credentials the model quotes in its own findings are masked too.
- The HTML report escapes every value that comes from the model.
- The GitHub Action no longer pastes its inputs into a shell script.

### Fixed

- A failed AI audit (bad API key, network error, out of budget or turns) no
  longer produces a report marked as AI-powered with placeholder scores of 50.
  The report now contains the static results, `aiPowered` is `false`, and the
  reason is given in a new `warnings` field and on stderr.
- `--json` output larger than 64 KB was cut off when piped to another program.
- A typo in `--categories` or `--output` produced an empty report that passed.
  Unknown values are now rejected with exit code 2.
- `--fast` crashed on replies that start with a thinking block (newer models).
- Scores, severities and line numbers from the model are validated, so one
  malformed value can no longer produce `NaN` scores or broken reports.
- The token budget (`--max-budget`) now counts cached tokens too. An audit that
  ran close to the limit before may need a higher `--max-budget`.
- The GitHub Action never produced a report: it wrote to a directory that did
  not exist. It now works, fails when the audit fails, and its summary says
  whether the run was AI or static only.

### Changed

- When a project has more files than `--max-files`, the report says how many
  were left out instead of skipping them silently.
- The package no longer declares a `main` entry. `require('claude-audit')` ran
  the CLI and exited the calling process; this package is a command-line tool,
  not a library.
- Releases are published to npm from GitHub Actions with Trusted Publishing.

## [0.2.2] - 2026-06-01

### Added

- Production-leftovers detection for JavaScript, Python and PHP.

## [0.2.1] - 2026-06-01

### Added

- Production-leftovers detection (debug output and similar left in shipped code).

## [0.2.0] - 2026-06-01

### Added

- Agentic audit mode: Claude investigates the project with read-only tools
  (the default when an API key is set). `--fast` keeps the one-shot mode.
- `--max-turns`, `--max-budget`, `--no-trace` and `--verbose`.

## [0.1.1] - 2026-04-22

### Changed

- Warm amber terminal theme.

## [0.1.0] - 2026-03-15

- First release.

[Unreleased]: https://github.com/itsmesherry/claude-audit/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/itsmesherry/claude-audit/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/itsmesherry/claude-audit/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/itsmesherry/claude-audit/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/itsmesherry/claude-audit/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/itsmesherry/claude-audit/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/itsmesherry/claude-audit/releases/tag/v0.1.0
