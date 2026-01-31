import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/program-years/:id/delegates', async (req, res) => {
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
  const { firstName, lastName, email, phone, userId, groupingId, partyId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
  };
  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: 'firstName, lastName and email required' });
    return;
  }
  const delegate = await prisma.delegate.create({
    data: {
      programYearId: py.id,
      firstName,
      lastName,
      email,
      phone,
      userId,
      groupingId,
      partyId,
      status: 'active',
    },
  });
  logger.info(py.programId, `Delegate ${delegate.id} created`);
  res.status(201).json(delegate);
});

router.get('/program-years/:id/delegates', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const delegates = await prisma.delegate.findMany({ where: { programYearId: py.id } });
  res.json(delegates);
});

router.put('/delegates/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, groupingId, partyId, status } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
    status?: string;
  };
  const updated = await prisma.delegate.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, groupingId, partyId, status },
  });
  logger.info(py.programId, `Delegate ${delegate.id} updated`);
  res.json(updated);
});

router.delete('/delegates/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.delegate.update({
    where: { id: Number(id) },
    data: { status: 'withdrawn' },
  });
  logger.info(py.programId, `Delegate ${delegate.id} withdrawn`);
  res.json(updated);
});

export default router;
