import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from './prisma';

const scrypt = promisify(_scrypt);

const app = express();
app.use(cors());
app.use(express.json());

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

  res.json({ message: 'Logged in' });
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

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

export default app;
