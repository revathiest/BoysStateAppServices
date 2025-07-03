import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from './prisma';
import { sign, verify } from './jwt';
import * as logger from './logger';

const scrypt = promisify(_scrypt);

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  const programId = (req as any).user?.programId || 'system';
  logger.info(programId, `${req.method} ${req.path}`);
  next();
});

const jwtSecret = process.env.JWT_SECRET || 'development-secret';

app.use((req, res, next) => {
  if (
    req.path === '/login' ||
    req.path === '/register' ||
    req.path.startsWith('/docs')
  ) {
    return next();
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = auth.slice(7);
  try {
    (req as any).user = verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

function ensureDatabase() {
  try {
    logger.info('system', 'Running database synchronization');
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (err) {
    logger.error('system', 'Database synchronization failed', err);
  }
}

// Load OpenAPI spec
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));

app.get('/docs/swagger.json', (_req, res) => {
  res.json(openApiDoc);
});

// Override server URL when not in production so Swagger points to the local API
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  openApiDoc.servers = [{ url: `http://localhost:${port}` }];
}

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

export const swaggerDoc = openApiDoc;

app.post('/register', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'User already exists' });
    return;
  }

  const salt = randomBytes(16).toString('hex');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  const hashed = `${salt}:${buf.toString('hex')}`;

  await prisma.user.create({ data: { email, password: hashed } });
  logger.info('system', `User registered: ${email}`);
  res.status(201).json({ message: 'User created' });
  return;
});

app.post('/login', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const [salt, storedHash] = user.password.split(':');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  if (buf.toString('hex') !== storedHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = sign({ userId: user.id, email: user.email }, jwtSecret);
  logger.info('system', `User logged in: ${email}`);
  res.json({ token });
  return;
});

app.get('/health', async (_req, res) => {
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

app.post('/logs', (req: express.Request, res: express.Response) => {
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

export async function getUserPrograms(
  req: express.Request,
  res: express.Response
) {
  const { username } = req.params as { username?: string };
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: username } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: { program: true },
  });
  const programs = assignments.map((a: any) => ({
    programId: a.program.id,
    programName: a.program.name,
    role: a.role,
  }));
  programs.forEach((p: any) => {
    logger.info(p.programId, `Program lookup for ${user.email}`);
  });
  res.json({ username: user.email, programs });
}

app.get('/programs/:username', getUserPrograms);

if (process.env.NODE_ENV !== 'test') {
  ensureDatabase();
  app.listen(port, () => {
    logger.info('system', `Server listening on port ${port}`);
  });
}

export default app;
