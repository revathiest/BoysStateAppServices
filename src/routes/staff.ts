import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/program-years/:id/staff', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
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
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const staff = await prisma.staff.findMany({ where: { programYearId: py.id } });
  res.json(staff);
});

router.put('/staff/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, role, groupingId, status } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    role?: string;
    groupingId?: number;
    status?: string;
  };
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
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
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
