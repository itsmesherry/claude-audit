export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AuditCategory = 'security' | 'quality' | 'performance' | 'architecture' | 'dependencies' | 'testing' | 'documentation';
export interface Finding {
    id: string;
    category: AuditCategory;
    severity: Severity;
    title: string;
    description: string;
    file?: string;
    line?: number;
    snippet?: string;
    fix?: string;
    references?: string[];
}
export interface CategoryScore {
    category: AuditCategory;
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    findings: Finding[];
    summary: string;
}
export interface ProjectInfo {
    name: string;
    path: string;
    languages: Record<string, number>;
    frameworks: string[];
    totalFiles: number;
    totalLines: number;
    hasTests: boolean;
    hasDependencyFile: boolean;
    dependencyFile?: string;
    dependencies: Record<string, string>;
    testFrameworks: string[];
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go' | 'maven' | 'gradle';
}
export interface ScannedFile {
    path: string;
    relativePath: string;
    language: string;
    lines: number;
    size: number;
    content: string;
}
export interface AuditReport {
    version: string;
    timestamp: string;
    project: ProjectInfo;
    overallScore: number;
    overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    categories: CategoryScore[];
    allFindings: Finding[];
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    aiPowered: boolean;
    durationMs: number;
}
export interface AuditOptions {
    path: string;
    apiKey?: string;
    output: ('terminal' | 'markdown' | 'html' | 'json')[];
    categories?: AuditCategory[];
    maxFileSize: number;
    maxFiles: number;
    model: string;
    noAi: boolean;
    quiet: boolean;
}
//# sourceMappingURL=types.d.ts.map