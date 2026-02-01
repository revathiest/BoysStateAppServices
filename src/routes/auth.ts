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

// Refresh token (authenticated user)
router.post('/refresh', async (req: express.Request, res: express.Response) => {
  const caller = (req as any).user as { userId: number; email: string } | undefined;
  if (!caller) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Verify user still exists
  const user = await prisma.user.findUnique({ where: { id: caller.userId } });
  if (!user) {
    res.status(401).json({ error: 'User not found' });
    return;
  }

  // Issue a new token
  const token = sign({ userId: user.id, email: user.email }, config.jwtSecret);
  logger.info('system', `Token refreshed for: ${user.email}`);
  res.json({ token });
});

// Change own password (authenticated user)
router.put('/change-password', async (req: express.Request, res: express.Response) => {
  const caller = (req as any).user as { userId: number; email: string } | undefined;
  if (!caller) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: caller.userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Verify current password
  const [salt, storedHash] = user.password.split(':');
  const buf = (await scrypt(currentPassword, salt, 64)) as Buffer;
  if (buf.toString('hex') !== storedHash) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  // Hash new password
  const newSalt = randomBytes(16).toString('hex');
  const newBuf = (await scrypt(newPassword, newSalt, 64)) as Buffer;
  const newHashed = `${newSalt}:${newBuf.toString('hex')}`;

  await prisma.user.update({
    where: { id: caller.userId },
    data: { password: newHashed },
  });

  logger.info('system', `User ${caller.email} changed their password`);
  res.json({ message: 'Password changed successfully' });
});

// Admin reset password for a user (by staff/delegate ID)
router.put('/users/:userId/password', async (req: express.Request, res: express.Response) => {
  const caller = (req as any).user as { userId: number; email: string } | undefined;
  if (!caller) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { userId } = req.params as { userId: string };
  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword) {
    res.status(400).json({ error: 'New password required' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const targetUserId = parseInt(userId);
  if (isNaN(targetUserId)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  // Find the target user
  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Check if caller has admin access to at least one program the target user is in
  // Get programs where caller is admin
  const callerAdminPrograms = await prisma.programAssignment.findMany({
    where: { userId: caller.userId, role: 'admin' },
    select: { programId: true },
  });
  const callerProgramIds = callerAdminPrograms.map((p) => p.programId);

  // Check if target user is in any of those programs (via Staff or Delegate)
  const targetStaff = await prisma.staff.findFirst({
    where: {
      userId: targetUserId,
      programYear: { programId: { in: callerProgramIds } },
    },
  });
  const targetDelegate = await prisma.delegate.findFirst({
    where: {
      userId: targetUserId,
      programYear: { programId: { in: callerProgramIds } },
    },
  });

  if (!targetStaff && !targetDelegate) {
    res.status(403).json({ error: 'Forbidden: You can only reset passwords for users in programs you administer' });
    return;
  }

  // Hash new password
  const salt = randomBytes(16).toString('hex');
  const buf = (await scrypt(newPassword, salt, 64)) as Buffer;
  const hashed = `${salt}:${buf.toString('hex')}`;

  await prisma.user.update({
    where: { id: targetUserId },
    data: { password: hashed },
  });

  logger.info('system', `Admin ${caller.email} reset password for user ${targetUser.email}`);
  res.json({ message: 'Password reset successfully' });
});

export default router;
