# Contributing

Thanks for wanting to help. Bug reports, fixes and new detection rules are all welcome.

## Setup

```bash
git clone https://github.com/itsmesherry/claude-audit
cd claude-audit
npm install
npm test                          # builds, then runs the test suite
npm run dev -- ./some-project     # run the CLI from source
```

Node 18 or newer. No API key is needed for the tests: the Anthropic SDK is mocked.

## Making a change

1. Open an issue first for anything large, so we can agree on the approach.
2. Branch from `main`. `main` is protected, so every change goes through a pull request.
3. Add a test for what you changed. A new detection rule needs one case that
   should match and one that should not.
4. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) if users will notice the change.
5. Run `npm run typecheck && npm test` before pushing. CI runs the same on Node 18 to 24.

Known gaps and ideas are listed in [TODO.md](TODO.md).

## Two rules for this codebase

- **Never print a secret.** Anything a rule matches may be a real credential.
  Snippets go through `maskLine` in `src/analyzers/static/secrets.ts`.
- **The agent's tools are read-only and stay inside the project.** Every path
  goes through `safeResolve` in `src/analyzers/ai/tools.ts`.

## Releasing (maintainer)

1. Open a release PR: set the version in `package.json` (`npm version X.Y.Z --no-git-tag-version`)
   and rename `## [Unreleased]` in the changelog to the version and date.
2. Merge it, then publish a GitHub Release with the tag `vX.Y.Z` on that commit.
3. The `Publish to npm` workflow runs, checks that the tag matches `package.json`,
   waits for approval of the `npm` environment, and publishes with Trusted Publishing.
4. Move the `v0` tag to the new release, so `uses: itsmesherry/claude-audit@v0` picks it up:
   `git tag -f v0 vX.Y.Z && git push -f origin v0`.
