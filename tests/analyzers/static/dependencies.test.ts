import { analyzeDependencies } from '../../../src/analyzers/static/dependencies';
import type { ProjectInfo } from '../../../src/core/types';

function makeProjectInfo(deps: Record<string, string>): ProjectInfo {
  return {
    name: 'test-project',
    path: '/test',
    languages: { TypeScript: 5 },
    frameworks: [],
    totalFiles: 5,
    totalLines: 500,
    hasTests: false,
    hasDependencyFile: true,
    dependencyFile: 'package.json',
    dependencies: deps,
    testFrameworks: [],
    packageManager: 'npm',
  };
}

describe('analyzeDependencies', () => {
  it('returns empty array for no dependencies', () => {
    expect(analyzeDependencies(makeProjectInfo({}))).toEqual([]);
  });

  it('returns empty array for safe dependencies', () => {
    const findings = analyzeDependencies(makeProjectInfo({
      'express': '^4.18.0',
      'typescript': '^5.0.0',
    }));
    expect(findings).toEqual([]);
  });

  it('flags vulnerable lodash versions', () => {
    const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.15' }));
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].title).toContain('lodash');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].category).toBe('dependencies');
  });

  it('does not flag safe lodash versions', () => {
    const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.21' }));
    expect(findings).toEqual([]);
  });

  it('flags deprecated packages', () => {
    const findings = analyzeDependencies(makeProjectInfo({ moment: '^2.29.0' }));
    expect(findings.some(f => f.title.includes('moment'))).toBe(true);
  });

  it('flags deprecated request package', () => {
    const findings = analyzeDependencies(makeProjectInfo({ request: '^2.88.0' }));
    expect(findings.some(f => f.title.includes('Deprecated'))).toBe(true);
  });

  it('flags vulnerable axios versions', () => {
    const findings = analyzeDependencies(makeProjectInfo({ axios: '^0.21.0' }));
    expect(findings.some(f => f.title.includes('axios') && f.title.includes('Vulnerable'))).toBe(true);
  });

  it('does not flag safe axios versions', () => {
    const findings = analyzeDependencies(makeProjectInfo({ axios: '^0.21.2' }));
    expect(findings).toEqual([]);
  });

  it('flags excessive dependency count', () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 101; i++) {
      deps[`safe-pkg-${i}`] = '1.0.0';
    }
    const findings = analyzeDependencies(makeProjectInfo(deps));
    expect(findings.some(f => f.title === 'Excessive Dependency Count')).toBe(true);
  });

  it('does not flag moderate dependency count', () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      deps[`safe-pkg-${i}`] = '1.0.0';
    }
    const findings = analyzeDependencies(makeProjectInfo(deps));
    expect(findings.some(f => f.title === 'Excessive Dependency Count')).toBe(false);
  });

  it('handles multiple vulnerabilities at once', () => {
    const findings = analyzeDependencies(makeProjectInfo({
      lodash: '^4.17.15',
      axios: '^0.20.0',
      moment: '^2.29.0',
      request: '^2.88.0',
    }));
    expect(findings.length).toBeGreaterThanOrEqual(4);
  });

  it('assigns correct fix suggestions for vulnerable packages', () => {
    const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.15' }));
    expect(findings[0].fix).toContain('4.17.21');
  });

  it('assigns unique IDs to each finding', () => {
    const findings = analyzeDependencies(makeProjectInfo({
      lodash: '^4.17.15',
      moment: '^2.29.0',
      request: '^2.88.0',
    }));
    const ids = findings.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
