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
    res.status(204).end();
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
  // Get the base position to copy values
  const basePosition = await prisma.position.findUnique({ where: { id: positionId } });
  if (!basePosition) {
    res.status(400).json({ error: 'Position not found' });
    return;
  }
  // Copy all relevant fields from base position to year-specific position
  const pypos = await prisma.programYearPosition.create({
    data: {
      programYearId: py.id,
      positionId,
      delegateId,
      isElected: basePosition.isElected,
      isNonPartisan: basePosition.isNonPartisan,
      requiresDeclaration: basePosition.requiresDeclaration,
      requiresPetition: basePosition.requiresPetition,
      petitionSignatures: basePosition.petitionSignatures,
      status: 'active',
    },
  });
  logger.info(py.programId, `ProgramYearPosition ${pypos.id} created`);
  res.status(201).json(pypos);
});

router.get('/program-years/:id/positions', async (req, res) => {
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
  const records = await prisma.programYearPosition.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { position: true, delegate: true },
  });
  res.json(records);
});

// Bulk activate positions for a program year
router.post('/program-years/:id/positions/activate', async (req, res) => {
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
  const { positionIds } = req.body as { positionIds?: number[] };
  if (!Array.isArray(positionIds) || positionIds.length === 0) {
    res.status(400).json({ error: 'positionIds required' });
    return;
  }

  // Delete existing activations for this program year
  await prisma.programYearPosition.deleteMany({
    where: { programYearId: py.id },
  });

  // Fetch base positions to copy all relevant values
  const basePositions = await prisma.position.findMany({
    where: { id: { in: positionIds } },
    select: {
      id: true,
      isElected: true,
      isNonPartisan: true,
      requiresDeclaration: true,
      requiresPetition: true,
      petitionSignatures: true,
    },
  });
  const positionMap = new Map(basePositions.map((p) => [p.id, p]));

  // Create new activations with all fields copied from base position
  const records = await Promise.all(
    positionIds.map((pid) => {
      const basePos = positionMap.get(pid);
      return prisma.programYearPosition.create({
        data: {
          programYearId: py.id,
          positionId: pid,
          isElected: basePos?.isElected || false,
          isNonPartisan: basePos?.isNonPartisan,
          requiresDeclaration: basePos?.requiresDeclaration,
          requiresPetition: basePos?.requiresPetition,
          petitionSignatures: basePos?.petitionSignatures,
          status: 'active',
        },
      });
    })
  );
  logger.info(py.programId, `Activated ${records.length} positions for PY ${py.year}`);
  res.status(201).json(records);
});

router.put('/program-year-positions/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const record = await prisma.programYearPosition.findUnique({ where: { id: Number(id) } });
  if (!record) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: record.programYearId } });
  if (!py) {
    res.status(204).end();
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
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: record.programYearId } });
  if (!py) {
    res.status(204).end();
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
