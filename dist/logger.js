"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.info = info;
exports.error = error;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function writeLog(entry) {
    const logsDir = path_1.default.join(__dirname, '..', 'logs');
    if (!(0, fs_1.existsSync)(logsDir)) {
        (0, fs_1.mkdirSync)(logsDir, { recursive: true });
    }
    const file = path_1.default.join(logsDir, `${entry.programId}.log`);
    (0, fs_1.appendFileSync)(file, JSON.stringify(entry) + '\n');
}
function info(programId, message) {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        programId,
        message,
    });
}
function error(programId, message, err) {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        programId,
        message,
        error: err ? (err instanceof Error ? err.stack || err.message : String(err)) : undefined,
    });
}
