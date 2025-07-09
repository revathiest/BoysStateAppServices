/* istanbul ignore file */
import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/program-years/:id/elections', async (req, res) => {
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
  const { positionId, groupingId, method, startTime, endTime } = req.body as {
    positionId?: number;
    groupingId?: number;
    method?: string;
    startTime?: string;
    endTime?: string;
  };
  if (!positionId || !groupingId || !method) {
    res.status(400).json({ error: 'positionId, groupingId and method required' });
    return;
  }
  const election = await prisma.election.create({
    data: {
      programYearId: py.id,
      positionId,
      groupingId,
      method,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      status: 'scheduled',
    },
  });
  logger.info(py.programId, `Election ${election.id} created`);
  res.status(201).json(election);
});

router.get('/program-years/:id/elections', async (req, res) => {
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
  const elections = await prisma.election.findMany({ where: { programYearId: py.id } });
  res.json(elections);
});

router.put('/elections/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { status, startTime, endTime } = req.body as {
    status?: string;
    startTime?: string;
    endTime?: string;
  };
  const updated = await prisma.election.update({
    where: { id: Number(id) },
    data: {
      status,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    },
  });
  logger.info(py.programId, `Election ${election.id} updated`);
  res.json(updated);
});

router.delete('/elections/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.election.update({ where: { id: Number(id) }, data: { status: 'archived' } });
  logger.info(py.programId, `Election ${election.id} removed`);
  res.json(updated);
});

router.post('/elections/:id/vote', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { candidateId, voterId, rank } = req.body as {
    candidateId?: number;
    voterId?: number;
    rank?: number;
  };
  if (!candidateId || !voterId) {
    res.status(400).json({ error: 'candidateId and voterId required' });
    return;
  }
  const vote = await prisma.electionVote.create({
    data: { electionId: election.id, candidateDelegateId: candidateId, voterDelegateId: voterId, voteRank: rank },
  });
  logger.info(py.programId, `Vote ${vote.id} recorded`);
  res.status(201).json(vote);
});

router.get('/elections/:id/results', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const votes = await prisma.electionVote.groupBy({
    by: ['candidateDelegateId'],
    where: { electionId: election.id },
    _count: true,
  });
  res.json({ results: votes });
});

export default router;
