/* istanbul ignore file */
import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/programs/:programId/parties', async (req, res) => {
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
  const { name, abbreviation, color, icon, displayOrder } = req.body as {
    name?: string;
    abbreviation?: string;
    color?: string;
    icon?: string;
    displayOrder?: number;
  };
  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const party = await prisma.party.create({
    data: { programId, name, abbreviation, color, icon, displayOrder, status: 'active' },
  });
  logger.info(programId, `Party ${party.id} created`);
  res.status(201).json(party);
});

router.get('/programs/:programId/parties', async (req, res) => {
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
  const parties = await prisma.party.findMany({
    where: { programId },
    orderBy: { displayOrder: 'asc' },
  });
  res.json(parties);
});

router.put('/parties/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const party = await prisma.party.findUnique({ where: { id: Number(id) } });
  if (!party) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, party.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, abbreviation, color, icon, displayOrder, status } = req.body as {
    name?: string;
    abbreviation?: string;
    color?: string;
    icon?: string;
    displayOrder?: number;
    status?: string;
  };
  const updated = await prisma.party.update({
    where: { id: Number(id) },
    data: { name, abbreviation, color, icon, displayOrder, status },
  });
  logger.info(party.programId, `Party ${party.id} updated`);
  res.json(updated);
});

router.delete('/parties/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const party = await prisma.party.findUnique({ where: { id: Number(id) } });
  if (!party) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, party.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.party.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(party.programId, `Party ${party.id} retired`);
  res.json(updated);
});

router.post('/program-years/:id/parties/activate', async (req, res) => {
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
  const { partyIds } = req.body as { partyIds?: number[] };
  if (!Array.isArray(partyIds) || partyIds.length === 0) {
    res.status(400).json({ error: 'partyIds required' });
    return;
  }
  const records = await Promise.all(
    partyIds.map((pid) =>
      prisma.programYearParty.create({
        data: { programYearId: py.id, partyId: pid, status: 'active' },
      })
    )
  );
  logger.info(py.programId, `Activated ${records.length} parties for PY ${py.year}`);
  res.status(201).json(records);
});

router.get('/program-years/:id/parties', async (req, res) => {
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
  const records = await prisma.programYearParty.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { party: true },
  });
  res.json(records);
});

export default router;
