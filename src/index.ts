import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import crypto from 'crypto';
import prisma from './prisma';

const app = express();
app.use(cors());
app.use(express.json());

// Load OpenAPI spec
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

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

app.post('/register', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  const passwordHash = hashPassword(password);
  try {
    const user = await prisma.user.create({ data: { email, passwordHash } });
    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    console.error('Registration failed', err);
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  const passwordHash = hashPassword(password);
  if (passwordHash !== user.passwordHash) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }
  res.json({ id: user.id, email: user.email });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

export default app;
