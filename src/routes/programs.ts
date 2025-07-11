import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember, getUserPrograms } from '../utils/auth';

const router = express.Router();

// Create a program and assign the creator as admin
router.post('/programs', async (req, res) => {
  const user = (req as any).user as { userId: number; email: string };
  const { name, year } = req.body as {
    name?: string;
    year?: number;
  };
  if (!name || !year) {
    res.status(400).json({ error: 'name and year required' });
    return;
  }
  const program = await prisma.program.create({
    data: {
      name,
      year,
      createdBy: { connect: { id: user.userId } },
    },
  });
  await prisma.programAssignment.create({
    data: { userId: user.userId, programId: program.id, role: 'admin' },
  });
  logger.info(program.id, `Program created by ${user.email}`);
  res.status(201).json({
    id: program.id,
    name: program.name,
    year: program.year,
    createdBy: user.userId,
    roleAssigned: 'admin',
  });
});

// List all programs
router.get('/programs', async (_req, res) => {
  const programs = await prisma.program.findMany();
  res.json(programs);
});

// Assign a user to a program
router.post('/programs/:programId/users', async (req, res) => {
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
  const { userId, role } = req.body as { userId?: number; role?: string };
  if (!userId || !role) {
    res.status(400).json({ error: 'userId and role required' });
    return;
  }
  await prisma.programAssignment.create({
    data: { userId, programId, role },
  });
  logger.info(programId, `User ${userId} assigned role ${role}`);
  res.status(201).json({
    programId,
    userId,
    role,
    status: 'assigned',
  });
});

// List users for a program
router.get('/programs/:programId/users', async (req, res) => {
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
  const assignments = await prisma.programAssignment.findMany({
    where: { programId },
    select: { userId: true, role: true },
  });
  logger.info(programId, `Listed users for program`);
  res.json(assignments);
});

// Get programs for a user
router.get('/user-programs/:username', getUserPrograms);

// Get program details
router.get('/programs/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const member = await isProgramMember(caller.userId, id!);
  if (!member) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(program);
});


// Update program fields
router.put('/programs/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, id!);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, year, status } = req.body as {
    name?: string;
    year?: number;
    status?: string;
  };
  const updated = await prisma.program.update({
    where: { id },
    data: { name, year, status },
  });
  logger.info(id!, `Program updated by ${caller.email}`);
  res.json(updated);
});

// Retire a program
router.delete('/programs/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, id!);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.program.update({
    where: { id },
    data: { status: 'retired' },
  });
  logger.info(id!, `Program retired by ${caller.email}`);
  res.json(updated);
});

export default router;
