import { appendFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'error';
  programId: string;
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
}

export function info(programId: string, message: string) {
  writeLog({
    timestamp: new Date().toISOString(),
    level: 'info',
    programId,
    message,
  });
}

export function error(programId: string, message: string, err?: unknown) {
  writeLog({
    timestamp: new Date().toISOString(),
    level: 'error',
    programId,
    message,
    error: err ? (err instanceof Error ? err.stack || err.message : String(err)) : undefined,
  });
}
