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

const scrypt = promisify(_scrypt);

const app = express();
app.use(cors());
app.use(express.json());

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
    console.log('Running database synchronization');
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (err) {
    console.error('Database synchronization failed', err);
  }
}

// Load OpenAPI spec
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

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

  const token = sign({ userId: user.id }, jwtSecret);
  res.json({ token });
  return;
});

app.get('/health', async (_req, res) => {
  console.log('Serving /health');
  let dbStatus = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error('Database check failed', err);
    dbStatus = 'error';
  }
  res.json({ status: 'ok', database: dbStatus });
});

app.get('/programs', async (req, res) => {
  const userId = (req as any).user.userId as number;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const assignments = await prisma.programAssignment.findMany({
    where: { userId },
    include: { program: true },
  });
  const programs = assignments.map((a: any) => ({
    programId: a.program.id,
    programName: a.program.name,
    role: a.role,
  }));
  res.json({ username: user?.email ?? '', programs });
});

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  ensureDatabase();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
