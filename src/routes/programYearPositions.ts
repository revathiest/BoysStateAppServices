/* istanbul ignore file */
import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/program-years/:id/positions', async (req, res) => {
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
  const { positionId, delegateId } = req.body as { positionId?: number; delegateId?: number };
  if (!positionId) {
    res.status(400).json({ error: 'positionId required' });
    return;
  }
  const pypos = await prisma.programYearPosition.create({
    data: { programYearId: py.id, positionId, delegateId, status: 'active' },
  });
  logger.info(py.programId, `ProgramYearPosition ${pypos.id} created`);
  res.status(201).json(pypos);
});

router.get('/program-years/:id/positions', async (req, res) => {
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
  const records = await prisma.programYearPosition.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { position: true, delegate: true },
  });
  res.json(records);
});

router.put('/program-year-positions/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const record = await prisma.programYearPosition.findUnique({ where: { id: Number(id) } });
  if (!record) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: record.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { delegateId, status } = req.body as { delegateId?: number; status?: string };
  const updated = await prisma.programYearPosition.update({ where: { id: Number(id) }, data: { delegateId, status } });
  logger.info(py.programId, `ProgramYearPosition ${record.id} updated`);
  res.json(updated);
});

router.delete('/program-year-positions/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const record = await prisma.programYearPosition.findUnique({ where: { id: Number(id) } });
  if (!record) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: record.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.programYearPosition.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
  logger.info(py.programId, `ProgramYearPosition ${record.id} removed`);
  res.json(updated);
});

export default router;
