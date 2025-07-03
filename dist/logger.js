"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const prisma_1 = __importDefault(require("./prisma"));
function writeLog(entry) {
    const logsDir = path_1.default.join(__dirname, '..', 'logs');
    if (!(0, fs_1.existsSync)(logsDir)) {
        (0, fs_1.mkdirSync)(logsDir, { recursive: true });
    }
    const file = path_1.default.join(logsDir, `${entry.programId}.log`);
    (0, fs_1.appendFileSync)(file, JSON.stringify(entry) + '\n');
    prisma_1.default.log
        .create({
        data: {
            timestamp: new Date(entry.timestamp),
            level: entry.level,
            source: entry.source,
            programId: entry.programId,
            message: entry.message,
            error: entry.error,
        },
    })
        .catch(() => {
        /* ignore logging failures */
    });
}
function debug(programId, message, source = 'api') {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'debug',
        programId,
        source,
        message,
    });
}
function info(programId, message, source = 'api') {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'info',
        programId,
        source,
        message,
    });
}
function warn(programId, message, source = 'api') {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'warn',
        programId,
        source,
        message,
    });
}
function error(programId, message, err, source = 'api') {
    writeLog({
        timestamp: new Date().toISOString(),
        level: 'error',
        programId,
        source,
        message,
        error: err
            ? err instanceof Error
                ? err.stack || err.message
                : String(err)
            : undefined,
    });
}
