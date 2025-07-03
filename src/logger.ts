import { appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import prisma from './prisma';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  programId: string;
  source: string;
  message: string;
  error?: string;
}

function writeLog(entry: LogEntry) {
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  const file = path.join(logsDir, `${entry.programId}.log`);
  appendFileSync(file, JSON.stringify(entry) + '\n');
  prisma.log
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

export function debug(programId: string, message: string, source = 'api') {
  writeLog({
    timestamp: new Date().toISOString(),
    level: 'debug',
    programId,
    source,
    message,
  });
}

export function info(programId: string, message: string, source = 'api') {
  writeLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    programId,
    source,
    message,
  });
}

export function warn(programId: string, message: string, source = 'api') {
  writeLog({
    timestamp: new Date().toISOString(),
    level: 'warn',
    programId,
    source,
    message,
  });
}

export function error(
  programId: string,
  message: string,
  err?: unknown,
  source = 'api',
) {
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
