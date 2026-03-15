"use strict";
// ─────────────────────────────────────────────
//  claude-audit — JSON Reporter
// ─────────────────────────────────────────────
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJsonReport = generateJsonReport;
const fs_1 = __importDefault(require("fs"));
function generateJsonReport(report, outputPath) {
    fs_1.default.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}
//# sourceMappingURL=json.js.map