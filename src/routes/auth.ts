import express from 'express';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from '../prisma';
import { sign } from '../jwt';
import * as logger from '../logger';
import { config } from '../config';

const scrypt = promisify(_scrypt);
const router = express.Router();

export const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

router.post('/register', async (req: express.Request, res: express.Response) => {
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
});

router.post('/login', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const now = Date.now();
  const ip = req.ip || '';
  const attempt = loginAttempts.get(ip);
  if (attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) {
    logger.warn('system', `Too many login attempts from ${ip}`);
    res.status(429).json({ error: 'Too many login attempts' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
    loginAttempts.set(ip, { count, lastAttempt: now });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const [salt, storedHash] = user.password.split(':');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  if (buf.toString('hex') !== storedHash) {
    const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
    loginAttempts.set(ip, { count, lastAttempt: now });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  loginAttempts.delete(ip);

  const token = sign({ userId: user.id, email: user.email }, config.jwtSecret);
  logger.info('system', `User logged in: ${email}`);
  res.json({ token });
});

export default router;
