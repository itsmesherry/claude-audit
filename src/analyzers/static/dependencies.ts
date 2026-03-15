// ─────────────────────────────────────────────
//  claude-audit — Dependency Analyzer
// ─────────────────────────────────────────────

import type { ProjectInfo, Finding } from '../../core/types';

// Known vulnerable package patterns (simplified; in production, query OSV/Snyk/Grype)
const KNOWN_VULN_PACKAGES: Record<string, { minSafeVersion?: string; reason: string; severity: Finding['severity'] }> = {
  'lodash':         { minSafeVersion: '4.17.21', reason: 'Prototype pollution CVE-2021-23337', severity: 'high' },
  'node-fetch':     { minSafeVersion: '2.6.7',   reason: 'SSRF and URL parsing issues in <2.6.7', severity: 'medium' },
  'axios':          { minSafeVersion: '0.21.2',   reason: 'SSRF vulnerability in versions < 0.21.2', severity: 'high' },
  'minimist':       { minSafeVersion: '1.2.6',   reason: 'Prototype pollution CVE-2020-7598', severity: 'high' },
  'path-parse':     { minSafeVersion: '1.0.7',   reason: 'ReDoS CVE-2021-23343', severity: 'medium' },
  'nanoid':         { minSafeVersion: '3.1.31',  reason: 'Predictable ID generation in older versions', severity: 'medium' },
  'glob-parent':    { minSafeVersion: '5.1.2',   reason: 'ReDoS vulnerability', severity: 'medium' },
  'ws':             { minSafeVersion: '7.4.6',   reason: 'ReDoS in older versions', severity: 'medium' },
  'tar':            { minSafeVersion: '6.1.9',   reason: 'Path traversal CVEs', severity: 'high' },
  'semver':         { minSafeVersion: '7.5.4',   reason: 'ReDoS in older versions', severity: 'medium' },
  'moment':         { reason: 'Deprecated — use date-fns or dayjs instead (security + bundle size)', severity: 'low' },
  'request':        { reason: 'Deprecated and unmaintained — use axios or node-fetch', severity: 'medium' },
  'xmlhttprequest': { reason: 'Deprecated — use node-fetch or axios', severity: 'low' },
  'crypto-js':      { minSafeVersion: '4.2.0',   reason: 'Various crypto vulnerabilities in older versions', severity: 'high' },
  'serialize-javascript': { minSafeVersion: '6.0.0', reason: 'XSS vulnerability', severity: 'high' },
  'ansi-regex':     { minSafeVersion: '5.0.1',   reason: 'ReDoS CVE-2021-3807', severity: 'medium' },
  'parse-url':      { minSafeVersion: '8.1.0',   reason: 'SSRF and path traversal', severity: 'high' },
  'follow-redirects': { minSafeVersion: '1.15.4', reason: 'Exposure of sensitive headers', severity: 'medium' },
};

const DEPRECATED_PATTERNS: { test: RegExp; message: string; suggestion: string }[] = [
  { test: /^moment$/, message: 'moment.js is deprecated and very large', suggestion: 'Use date-fns (~6KB) or dayjs (~2KB)' },
  { test: /^request$/, message: 'request is unmaintained', suggestion: 'Use axios or native fetch' },
  { test: /^node-uuid$/, message: 'node-uuid is deprecated', suggestion: 'Use the built-in crypto.randomUUID()' },
  { test: /^underscore$/, message: 'Consider migrating from underscore', suggestion: 'Use lodash or native ES6+ methods' },
  { test: /^q$/, message: 'q promise library is outdated', suggestion: 'Use native Promises or async/await' },
  { test: /^bluebird$/, message: 'bluebird is no longer needed in modern Node.js', suggestion: 'Use native Promises or async/await' },
];

function parseVersion(v: string): [number, number, number] {
  const clean = v.replace(/^[^0-9]*/, '');
  const parts = clean.split('.').map(p => parseInt(p) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isVersionLessThan(version: string, minSafe: string): boolean {
  try {
    const [ma, mi, pa] = parseVersion(version);
    const [sma, smi, spa] = parseVersion(minSafe);
    if (ma !== sma) return ma < sma;
    if (mi !== smi) return mi < smi;
    return pa < spa;
  } catch (_e: unknown) {
    return false;
  }
}

export function analyzeDependencies(info: ProjectInfo): Finding[] {
  const findings: Finding[] = [];
  const deps = info.dependencies;

  if (Object.keys(deps).length === 0) return findings;

  let idx = 0;

  for (const [pkg, version] of Object.entries(deps)) {
    const vuln = KNOWN_VULN_PACKAGES[pkg.toLowerCase()];
    if (vuln) {
      const shouldFlag = !vuln.minSafeVersion ||
        isVersionLessThan(version, vuln.minSafeVersion);

      if (shouldFlag) {
        findings.push({
          id: `DEP-${String(++idx).padStart(3, '0')}`,
          category: 'dependencies',
          severity: vuln.severity,
          title: `Vulnerable Dependency: ${pkg}`,
          description: `${pkg}@${version} — ${vuln.reason}`,
          fix: vuln.minSafeVersion
            ? `Upgrade to ${pkg}@${vuln.minSafeVersion} or later`
            : vuln.reason,
        });
      }
    }

    // Check deprecated
    for (const dep of DEPRECATED_PATTERNS) {
      if (dep.test.test(pkg)) {
        findings.push({
          id: `DEP-${String(++idx).padStart(3, '0')}`,
          category: 'dependencies',
          severity: 'low',
          title: `Deprecated Package: ${pkg}`,
          description: dep.message,
          fix: dep.suggestion,
        });
        break;
      }
    }
  }

  // Flag very large number of dependencies
  const depCount = Object.keys(deps).length;
  if (depCount > 100) {
    findings.push({
      id: `DEP-${String(++idx).padStart(3, '0')}`,
      category: 'dependencies',
      severity: 'low',
      title: 'Excessive Dependency Count',
      description: `Project has ${depCount} declared dependencies. This increases attack surface and bundle size.`,
      fix: 'Audit dependencies regularly with `npm prune` or `depcheck`. Remove unused packages.',
    });
  }

  return findings;
}
