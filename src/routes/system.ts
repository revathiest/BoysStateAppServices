import express from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import prisma from '../prisma';
import * as logger from '../logger';

const router = express.Router();

const openApiPath = path.join(__dirname, '..', 'openapi.yaml');
const swaggerDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  swaggerDoc.servers = [{ url: `http://localhost:${port}` }];
}

router.get('/docs/swagger.json', (_req, res) => {
  res.json(swaggerDoc);
});

router.get('/docs/swagger-ui-custom.js', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'swagger-ui-custom.js'));
});

router.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, { customJs: 'swagger-ui-custom.js' }));

router.get('/health', async (_req, res) => {
  logger.info('system', 'Serving /health');
  let dbStatus = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error('system', 'Database check failed', err);
    dbStatus = 'error';
  }
  res.json({ status: 'ok', database: dbStatus });
});

router.post('/logs', (req: express.Request, res: express.Response) => {
  const { programId, level, message, error, source } = req.body as {
    programId?: string;
    level?: string;
    message?: string;
    error?: string;
    source?: string;
  };
  if (!programId || !level || !message) {
    res.status(400).json({ error: 'programId, level, and message required' });
    return;
  }
  const lvl = level as string;
  if (!['debug', 'info', 'warn', 'error'].includes(lvl)) {
    res.status(400).json({ error: 'Invalid level' });
    return;
  }
  const src = source || 'client';
  switch (lvl) {
    case 'debug':
      logger.debug(programId, message, src);
      break;
    case 'info':
      logger.info(programId, message, src);
      break;
    case 'warn':
      logger.warn(programId, message, src);
      break;
    case 'error':
      logger.error(programId, message, error, src);
      break;
  }
  res.status(204).send();
});

router.get('/logs', async (req: express.Request, res: express.Response) => {
  const {
    programId,
    level,
    source,
    dateFrom,
    dateTo,
    search,
    page = '1',
    pageSize = '50',
  } = req.query as {
    programId?: string;
    level?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  };

  if (level && !['debug', 'info', 'warn', 'error'].includes(level)) {
    res.status(400).json({ error: 'Invalid level' });
    return;
  }

  let p = parseInt(page, 10);
  if (isNaN(p) || p < 1) p = 1;
  let size = parseInt(pageSize, 10);
  if (isNaN(size) || size < 1) size = 50;
  if (size > 100) size = 100;

  const where: any = {};
  if (programId) where.programId = programId;
  if (level) where.level = level;
  if (source) where.source = source;
  if (dateFrom || dateTo) {
    where.timestamp = {} as any;
    if (dateFrom) (where.timestamp as any).gte = new Date(dateFrom);
    if (dateTo) (where.timestamp as any).lte = new Date(dateTo);
  }

  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    where.OR = [{ message: contains }, { error: contains }, { source: contains }];
  }

  const total = await prisma.log.count({ where });
  const logs = await prisma.log.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    skip: (p - 1) * size,
    take: size,
  });

  res.json({ logs, page: p, pageSize: size, total });
});

router.post('/audit-logs', async (req: express.Request, res: express.Response) => {
  const { tableName, recordId, userId, action, changes } = req.body as {
    tableName?: string;
    recordId?: string | number;
    userId?: number;
    action?: string;
    changes?: any;
  };
  if (!tableName || recordId === undefined || !userId || !action) {
    res.status(400).json({ error: 'tableName, recordId, userId and action required' });
    return;
  }
  const log = await prisma.auditLog.create({
    data: {
      tableName,
      recordId: String(recordId),
      userId,
      action,
      changes,
    },
  });
  res.status(201).json(log);
});

router.get('/audit-logs', async (req: express.Request, res: express.Response) => {
  const {
    tableName,
    recordId,
    userId,
    dateFrom,
    dateTo,
    page = '1',
    pageSize = '50',
  } = req.query as {
    tableName?: string;
    recordId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
    pageSize?: string;
  };

  let p = parseInt(page, 10);
  if (isNaN(p) || p < 1) p = 1;
  let size = parseInt(pageSize, 10);
  if (isNaN(size) || size < 1) size = 50;
  if (size > 100) size = 100;

  const where: any = {};
  if (tableName) where.tableName = tableName;
  if (recordId) where.recordId = recordId;
  if (userId) where.userId = Number(userId);
  if (dateFrom || dateTo) {
    where.timestamp = {} as any;
    if (dateFrom) (where.timestamp as any).gte = new Date(dateFrom);
    if (dateTo) (where.timestamp as any).lte = new Date(dateTo);
  }

  const total = await prisma.auditLog.count({ where });
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    skip: (p - 1) * size,
    take: size,
  });

  res.json({ auditLogs: logs, page: p, pageSize: size, total });
});

export { swaggerDoc };
export default router;
