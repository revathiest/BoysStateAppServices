import express from 'express';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const scryptAsync = promisify(scrypt);

// Hash a password using scrypt (same as auth.ts)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

const router = express.Router();

router.post('/program-years/:id/staff', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, role, groupingId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    role?: string;
    groupingId?: number;
  };
  if (!firstName || !lastName || !email || !role) {
    res.status(400).json({ error: 'firstName, lastName, email and role required' });
    return;
  }
  const staff = await prisma.staff.create({
    data: {
      programYearId: py.id,
      firstName,
      lastName,
      email,
      phone,
      userId,
      role,
      groupingId,
      status: 'active',
    },
  });
  logger.info(py.programId, `Staff ${staff.id} created`);
  res.status(201).json(staff);
});

router.get('/program-years/:id/staff', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  logger.info('unknown', `GET /program-years/${id}/staff requested by user ${caller.userId}`);
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    logger.info('unknown', `ProgramYear ${id} not found`);
    res.status(204).end();
    return;
  }
  logger.info(py.programId, `Found ProgramYear ${py.id} (year: ${py.year}) for program ${py.programId}`);
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const staff = await prisma.staff.findMany({ where: { programYearId: py.id } });
  logger.info(py.programId, `Found ${staff.length} staff for programYear ${py.id}`);
  res.json(staff);
});

router.put('/staff/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, role, groupingId, status, tempPassword } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    role?: string;
    groupingId?: number;
    status?: string;
    tempPassword?: string;
  };

  // If tempPassword provided and staff has a userId, update the user's password
  if (tempPassword && staff.userId) {
    const hashedPassword = await hashPassword(tempPassword);
    await prisma.user.update({
      where: { id: staff.userId },
      data: { password: hashedPassword },
    });
    logger.info(py.programId, `Password updated for staff ${staff.id}`);
  }

  const updated = await prisma.staff.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, role, groupingId, status },
  });
  logger.info(py.programId, `Staff ${staff.id} updated`);
  res.json(updated);
});

router.delete('/staff/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.staff.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
  logger.info(py.programId, `Staff ${staff.id} removed`);
  res.json(updated);
});

export default router;
