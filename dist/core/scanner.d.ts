import type { ScannedFile, ProjectInfo } from './types';
export declare function scanProject(projectPath: string, maxFiles: number, maxFileSizeKb: number): Promise<{
    files: ScannedFile[];
    info: ProjectInfo;
}>;
//# sourceMappingURL=scanner.d.ts.map