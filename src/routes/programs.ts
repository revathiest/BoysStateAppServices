import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember, getUserPrograms } from '../utils/auth';
import { DEFAULT_ROLES } from '../utils/permissions';

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

  // Create the initial ProgramYear record for the program's base year
  await prisma.programYear.create({
    data: {
      programId: program.id,
      year,
      status: 'active',
    },
  });

  await prisma.programAssignment.create({
    data: { userId: user.userId, programId: program.id, role: 'admin' },
  });

  // Create default roles for the program
  for (const roleConfig of DEFAULT_ROLES) {
    const role = await prisma.programRole.create({
      data: {
        programId: program.id,
        name: roleConfig.name,
        description: roleConfig.description,
        isDefault: roleConfig.isDefault,
        displayOrder: roleConfig.displayOrder,
      },
    });
    // Add permissions for the role
    if (roleConfig.permissions.length > 0) {
      await prisma.programRolePermission.createMany({
        data: roleConfig.permissions.map(permission => ({
          roleId: role.id,
          permission,
        })),
      });
    }
  }

  logger.info(program.id, `Created program "${program.name}" (year: ${year}) with default roles by ${user.email}`);
  res.status(201).json({
    id: program.id,
    name: program.name,
    year: program.year,
    createdBy: user.userId,
    roleAssigned: 'admin',
  });
});

// List programs for the authenticated user
router.get('/programs', async (req, res) => {
  const caller = (req as any).user as { userId: number; email: string };

  // Get user's program assignments with program details
  const assignments = await prisma.programAssignment.findMany({
    where: { userId: caller.userId },
    include: {
      program: true,
    },
  });

  // Transform to include role and use programId for consistency
  const programs = assignments.map((a) => ({
    programId: a.programId,
    programName: a.program.name,
    year: a.program.year,
    status: a.program.status,
    role: a.role,
  }));

  res.json({ programs, username: caller.email });
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
  logger.info(programId, `Assigned user ${userId} to role "${role}" by ${caller.email}`);
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
  logger.info(programId, `Listed ${assignments.length} user assignments by ${caller.email}`);
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
    res.status(204).end();
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
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, id!);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, year, status, defaultVotingMethod } = req.body as {
    name?: string;
    year?: number;
    status?: string;
    defaultVotingMethod?: string;
  };
  // Validate voting method if provided
  if (defaultVotingMethod && !['plurality', 'majority', 'ranked'].includes(defaultVotingMethod)) {
    res.status(400).json({ error: 'Invalid voting method. Must be plurality, majority, or ranked' });
    return;
  }
  const updated = await prisma.program.update({
    where: { id },
    data: { name, year, status, defaultVotingMethod },
  });
  logger.info(id!, `Updated program "${updated.name}" by ${caller.email}`);
  res.json(updated);
});

// Retire a program
router.delete('/programs/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(204).end();
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
  logger.info(id!, `Retired program "${program.name}" by ${caller.email}`);
  res.json(updated);
});

export default router;
