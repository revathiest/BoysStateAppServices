/* istanbul ignore file */
import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/programs/:programId/grouping-types', async (req, res) => {
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
  const { defaultName, customName, pluralName, levelOrder, isRequired } = req.body as {
    defaultName?: string;
    customName?: string;
    pluralName?: string;
    levelOrder?: number;
    isRequired?: boolean;
  };
  if (!defaultName || levelOrder === undefined) {
    res.status(400).json({ error: 'defaultName and levelOrder required' });
    return;
  }
  const gt = await prisma.groupingType.create({
    data: {
      programId,
      defaultName,
      customName,
      pluralName,
      levelOrder,
      isRequired: Boolean(isRequired),
      status: 'active',
    },
  });
  logger.info(programId, `GroupingType ${gt.id} created`);
  res.status(201).json(gt);
});

router.get('/programs/:programId/grouping-types', async (req, res) => {
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
  const types = await prisma.groupingType.findMany({
    where: { programId },
    orderBy: { levelOrder: 'asc' },
  });
  res.json(types);
});

router.put('/grouping-types/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const gt = await prisma.groupingType.findUnique({ where: { id: Number(id) } });
  if (!gt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { customName, pluralName, levelOrder, isRequired, status } = req.body as {
    customName?: string;
    pluralName?: string;
    levelOrder?: number;
    isRequired?: boolean;
    status?: string;
  };
  const updated = await prisma.groupingType.update({
    where: { id: Number(id) },
    data: { customName, pluralName, levelOrder, isRequired, status },
  });
  logger.info(gt.programId, `GroupingType ${gt.id} updated`);
  res.json(updated);
});

router.delete('/grouping-types/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const gt = await prisma.groupingType.findUnique({ where: { id: Number(id) } });
  if (!gt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.groupingType.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(gt.programId, `GroupingType ${gt.id} retired`);
  res.json(updated);
});

export default router;
