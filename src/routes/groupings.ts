import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/programs/:programId/groupings', async (req, res) => {
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
  const { groupingTypeId, parentGroupingId, name, displayOrder, notes } = req.body as {
    groupingTypeId?: number;
    parentGroupingId?: number;
    name?: string;
    displayOrder?: number;
    notes?: string;
  };
  if (!groupingTypeId || !name) {
    res.status(400).json({ error: 'groupingTypeId and name required' });
    return;
  }
  const grouping = await prisma.grouping.create({
    data: {
      programId,
      groupingTypeId,
      parentGroupingId,
      name,
      displayOrder,
      notes,
      status: 'active',
    },
  });
  logger.info(programId, `Grouping ${grouping.id} created`);
  res.status(201).json(grouping);
});

router.get('/programs/:programId/groupings', async (req, res) => {
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
  const groupings = await prisma.grouping.findMany({
    where: { programId },
    orderBy: { displayOrder: 'asc' },
  });
  res.json(groupings);
});

router.put('/groupings/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const grouping = await prisma.grouping.findUnique({ where: { id: Number(id) } });
  if (!grouping) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, displayOrder, notes, parentGroupingId, status } = req.body as {
    name?: string;
    displayOrder?: number;
    notes?: string;
    parentGroupingId?: number;
    status?: string;
  };
  const updated = await prisma.grouping.update({
    where: { id: Number(id) },
    data: { name, displayOrder, notes, parentGroupingId, status },
  });
  logger.info(grouping.programId, `Grouping ${grouping.id} updated`);
  res.json(updated);
});

router.delete('/groupings/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const grouping = await prisma.grouping.findUnique({ where: { id: Number(id) } });
  if (!grouping) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.grouping.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(grouping.programId, `Grouping ${grouping.id} retired`);
  res.json(updated);
});

router.post('/program-years/:id/groupings/activate', async (req, res) => {
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
  const { groupingIds } = req.body as { groupingIds?: number[] };
  if (!Array.isArray(groupingIds) || groupingIds.length === 0) {
    res.status(400).json({ error: 'groupingIds required' });
    return;
  }
  const records = await Promise.all(
    groupingIds.map((gid) =>
      prisma.programYearGrouping.create({
        data: { programYearId: py.id, groupingId: gid, status: 'active' },
      })
    )
  );
  logger.info(py.programId, `Activated ${records.length} groupings for PY ${py.year}`);
  res.status(201).json(records);
});

router.get('/program-years/:id/groupings', async (req, res) => {
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
  const records = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { grouping: true },
  });
  res.json(records);
});

export default router;
