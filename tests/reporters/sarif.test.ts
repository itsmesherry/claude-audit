import * as path from 'path';
import { buildSarif } from '../../src/reporters/sarif';
import type { AuditReport, Finding } from '../../src/core/types';

function report(findings: Finding[]): AuditReport {
  return {
    version: '0.0.0',
    timestamp: '',
    project: {
      name: 'demo', path: path.join(process.cwd(), 'demo'), languages: {}, frameworks: [], totalFiles: 1, totalLines: 1,
      hasTests: false, hasDependencyFile: true, dependencyFile: 'package.json', dependencies: {}, testFrameworks: [],
    },
    overallScore: 0, overallGrade: 'F', categories: [], allFindings: findings,
    criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, aiPowered: false, durationMs: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (findings: Finding[]): any => (buildSarif(report(findings)) as any).runs[0];

describe('buildSarif', () => {
  it('shares one rule between a static match and an AI finding with the same CWE', () => {
    const r = run([
      { id: 'SEC-010-0', category: 'security', severity: 'high', title: 'eval() Usage', description: '', file: 'src/a.js', line: 3, cwe: 'CWE-95' },
      { id: 'SEC-AGENT-1', category: 'security', severity: 'critical', title: 'RCE via eval', description: 'd', file: 'src/b.js', cwe: 'CWE-95', confidence: 'high' },
    ]);
    expect(r.tool.driver.rules).toHaveLength(1);
    expect(r.tool.driver.rules[0]).toMatchObject({
      id: 'security/CWE-95',
      properties: { tags: ['security', 'external/cwe/cwe-95'], 'security-severity': '7.5' },
    });
    expect(r.results.map((x: { level: string }) => x.level)).toEqual(['error', 'error']);
    expect(r.results[0].locations[0].physicalLocation).toEqual({ artifactLocation: { uri: 'demo/src/a.js' }, region: { startLine: 3 } });
    expect(r.results[1].properties).toEqual({ confidence: 'high' });
  });

  it('places file-less dependency findings on the manifest and drops other file-less ones', () => {
    const r = run([
      { id: 'DEP-001', category: 'dependencies', severity: 'high', title: 'Vulnerable Dependency: lodash', description: '' },
      { id: 'TST-001', category: 'testing', severity: 'high', title: 'No Tests Found', description: '' },
    ]);
    expect(r.results).toHaveLength(1);
    expect(r.results[0].ruleId).toBe('dependencies/vulnerable-dependency-lodash');
    expect(r.results[0].locations[0].physicalLocation.artifactLocation.uri).toBe('demo/package.json');
  });
});
