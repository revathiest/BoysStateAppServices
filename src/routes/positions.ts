import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/programs/:programId/positions', async (req, res) => {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number; email: string };
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, description, displayOrder } = req.body as {
    name?: string;
    description?: string;
    displayOrder?: number;
  };
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const position = await prisma.position.create({
    data: { programId, name, description, displayOrder, status: 'active' },
  });
  logger.info(programId, `Position ${position.id} created`);
  res.status(201).json(position);
});

router.get('/programs/:programId/positions', async (req, res) => {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number };
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const positions = await prisma.position.findMany({
    where: { programId },
    orderBy: { displayOrder: 'asc' },
  });
  res.json(positions);
});

router.put('/positions/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const position = await prisma.position.findUnique({ where: { id: Number(id) } });
  if (!position) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, position.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, description, displayOrder, status } = req.body as {
    name?: string;
    description?: string;
    displayOrder?: number;
    status?: string;
  };
  const updated = await prisma.position.update({
    where: { id: Number(id) },
    data: { name, description, displayOrder, status },
  });
  logger.info(position.programId, `Position ${position.id} updated`);
  res.json(updated);
});

router.delete('/positions/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const position = await prisma.position.findUnique({ where: { id: Number(id) } });
  if (!position) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, position.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.position.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(position.programId, `Position ${position.id} retired`);
  res.json(updated);
});

export default router;
