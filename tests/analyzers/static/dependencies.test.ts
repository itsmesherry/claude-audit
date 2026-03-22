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
  describe('empty and clean inputs', () => {
    it('returns empty array for no dependencies', () => {
      expect(analyzeDependencies(makeProjectInfo({}))).toEqual([]);
    });

    it('returns empty array for unknown safe packages', () => {
      const findings = analyzeDependencies(makeProjectInfo({
        express: '^4.18.0',
        typescript: '^5.0.0',
        zod: '^3.22.0',
      }));
      expect(findings).toEqual([]);
    });
  });

  describe('vulnerable package detection', () => {
    it('flags vulnerable lodash (below 4.17.21)', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.15' }));
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].title).toContain('lodash');
      expect(findings[0].severity).toBe('high');
      expect(findings[0].category).toBe('dependencies');
    });

    it('does not flag safe lodash (at 4.17.21)', () => {
      expect(analyzeDependencies(makeProjectInfo({ lodash: '^4.17.21' }))).toEqual([]);
    });

    it('flags vulnerable axios (below 0.21.2)', () => {
      const findings = analyzeDependencies(makeProjectInfo({ axios: '^0.21.0' }));
      expect(findings.some(f => f.title.includes('axios') && f.title.includes('Vulnerable'))).toBe(true);
    });

    it('does not flag safe axios (at 0.21.2)', () => {
      expect(analyzeDependencies(makeProjectInfo({ axios: '^0.21.2' }))).toEqual([]);
    });

    it('flags vulnerable minimist', () => {
      const findings = analyzeDependencies(makeProjectInfo({ minimist: '1.2.5' }));
      expect(findings.some(f => f.title.includes('minimist'))).toBe(true);
    });

    it('flags vulnerable tar', () => {
      const findings = analyzeDependencies(makeProjectInfo({ tar: '6.1.0' }));
      expect(findings.some(f => f.title.includes('tar'))).toBe(true);
    });

    it('flags vulnerable crypto-js', () => {
      const findings = analyzeDependencies(makeProjectInfo({ 'crypto-js': '3.1.9' }));
      expect(findings.some(f => f.title.includes('crypto-js'))).toBe(true);
    });
  });

  describe('version parsing with real-world formats', () => {
    it('parses caret ranges (^4.17.15)', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.15' }));
      expect(findings.some(f => f.title.includes('lodash'))).toBe(true);
    });

    it('parses tilde ranges (~4.17.15)', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '~4.17.15' }));
      expect(findings.some(f => f.title.includes('lodash'))).toBe(true);
    });

    it('parses exact versions (4.17.15)', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '4.17.15' }));
      expect(findings.some(f => f.title.includes('lodash'))).toBe(true);
    });

    it('handles wildcard (*) gracefully — treats as 0.0.0', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '*' }));
      expect(findings.some(f => f.title.includes('lodash'))).toBe(true);
    });

    it('handles "latest" gracefully', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: 'latest' }));
      expect(findings.some(f => f.title.includes('lodash'))).toBe(true);
    });

    it('correctly compares major version differences', () => {
      expect(analyzeDependencies(makeProjectInfo({ lodash: '3.10.1' }))).toEqual(
        expect.arrayContaining([expect.objectContaining({ title: expect.stringContaining('lodash') })]),
      );
      expect(analyzeDependencies(makeProjectInfo({ lodash: '5.0.0' }))).toEqual([]);
    });
  });

  describe('deprecated package detection', () => {
    it('flags moment as deprecated', () => {
      const findings = analyzeDependencies(makeProjectInfo({ moment: '^2.29.0' }));
      expect(findings.some(f => f.title.includes('Deprecated') && f.title.includes('moment'))).toBe(true);
    });

    it('flags request as deprecated', () => {
      const findings = analyzeDependencies(makeProjectInfo({ request: '^2.88.0' }));
      expect(findings.some(f => f.title.includes('Deprecated'))).toBe(true);
    });

    it('flags bluebird as deprecated', () => {
      const findings = analyzeDependencies(makeProjectInfo({ bluebird: '^3.7.2' }));
      expect(findings.some(f => f.title.includes('Deprecated') && f.title.includes('bluebird'))).toBe(true);
    });

    it('flags node-uuid as deprecated', () => {
      const findings = analyzeDependencies(makeProjectInfo({ 'node-uuid': '^1.4.8' }));
      expect(findings.some(f => f.title.includes('Deprecated'))).toBe(true);
    });

    it('does not flag non-deprecated packages', () => {
      const findings = analyzeDependencies(makeProjectInfo({ express: '^4.18.0' }));
      expect(findings.some(f => f.title.includes('Deprecated'))).toBe(false);
    });
  });

  describe('excessive dependency count', () => {
    it('flags >100 dependencies', () => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 101; i++) deps[`safe-pkg-${i}`] = '1.0.0';
      const findings = analyzeDependencies(makeProjectInfo(deps));
      expect(findings.some(f => f.title === 'Excessive Dependency Count')).toBe(true);
    });

    it('does not flag exactly 100 dependencies', () => {
      const deps: Record<string, string> = {};
      for (let i = 0; i < 100; i++) deps[`safe-pkg-${i}`] = '1.0.0';
      const findings = analyzeDependencies(makeProjectInfo(deps));
      expect(findings.some(f => f.title === 'Excessive Dependency Count')).toBe(false);
    });
  });

  describe('output quality', () => {
    it('includes fix suggestion with target version', () => {
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

    it('handles multiple vulnerabilities at once', () => {
      const findings = analyzeDependencies(makeProjectInfo({
        lodash: '^4.17.15',
        axios: '^0.20.0',
        moment: '^2.29.0',
        request: '^2.88.0',
      }));
      expect(findings.length).toBeGreaterThanOrEqual(4);
    });

    it('includes package version in description', () => {
      const findings = analyzeDependencies(makeProjectInfo({ lodash: '^4.17.15' }));
      expect(findings[0].description).toContain('^4.17.15');
    });
  });
});
