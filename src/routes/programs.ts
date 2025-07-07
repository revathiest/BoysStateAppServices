import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember, getUserPrograms } from "../utils/auth";
const router = express.Router();

router.post('/programs', async (req: express.Request, res: express.Response) => {
  const user = (req as any).user as { userId: number; email: string };
  const { name, year, config } = req.body as {
    name?: string;
    year?: number;
    config?: any;
  };
  if (!name || !year) {
    res.status(400).json({ error: 'name and year required' });
    return;
  }
  const program = await prisma.program.create({
    data: {
      name,
      year,
      config,
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

router.get('/programs', async (_req: express.Request, res: express.Response) => {
  const programs = await prisma.program.findMany();
  res.json(programs);
});


router.post(
  '/programs/:programId/users',
  async (req: express.Request, res: express.Response) => {
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
  },
);

router.get(
  '/programs/:programId/users',
  async (req: express.Request, res: express.Response) => {
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
  },
);

router.post(
  '/programs/:programId/years',
  async (req: express.Request, res: express.Response) => {
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
    const { year, startDate, endDate, status, notes } = req.body as {
      year?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
      notes?: string;
    };
    if (!year) {
      res.status(400).json({ error: 'year required' });
      return;
    }
    const py = await prisma.programYear.create({
      data: {
        programId,
        year,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: status || 'active',
        notes,
      },
    });
    logger.info(programId, `Program year ${year} created`);
    res.status(201).json(py);
  },
);

router.get(
  '/programs/:programId/years',
  async (req: express.Request, res: express.Response) => {
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
    const years = await prisma.programYear.findMany({
      where: { programId },
      orderBy: { year: 'desc' },
    });
    res.json(years);
  },
);

router.get('/program-years/:id', async (req: express.Request, res: express.Response) => {
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
  res.json(py);
});

router.put('/program-years/:id', async (req: express.Request, res: express.Response) => {
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
  const { startDate, endDate, status, notes } = req.body as {
    startDate?: string;
    endDate?: string;
    status?: string;
    notes?: string;
  };
  const updated = await prisma.programYear.update({
    where: { id: Number(id) },
    data: {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      notes,
    },
  });
  logger.info(py.programId, `Program year ${py.year} updated`);
  res.json(updated);
});

router.delete('/program-years/:id', async (req: express.Request, res: express.Response) => {
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
  const updated = await prisma.programYear.update({
    where: { id: Number(id) },
    data: { status: 'archived' },
  });
  logger.info(py.programId, `Program year ${py.year} archived`);
  res.json(updated);
});

router.get('/user-programs/:username', getUserPrograms);

router.get('/programs/:id', async (req: express.Request, res: express.Response) => {
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

router.get('/programs/:id/branding', async (req: express.Request, res: express.Response) => {
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
  const branding = {
    brandingLogoUrl: program.brandingLogoUrl,
    brandingPrimaryColor: program.brandingPrimaryColor,
    brandingSecondaryColor: program.brandingSecondaryColor,
    welcomeMessage: program.welcomeMessage,
    contactEmail: program.contactEmail,
    contactPhone: program.contactPhone,
    socialLinks: program.socialLinks,
  };
  res.json(branding);
});

router.put('/programs/:id/branding', async (req: express.Request, res: express.Response) => {
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
  const {
    brandingLogoUrl,
    brandingPrimaryColor,
    brandingSecondaryColor,
    welcomeMessage,
    contactEmail,
    contactPhone,
    socialLinks,
  } = req.body as any;
  const updated = await prisma.program.update({
    where: { id },
    data: {
      brandingLogoUrl,
      brandingPrimaryColor,
      brandingSecondaryColor,
      welcomeMessage,
      contactEmail,
      contactPhone,
      socialLinks,
    },
  });
  logger.info(id!, `Branding updated by ${caller.email}`);
  res.json(updated);
});

router.put('/programs/:id', async (req: express.Request, res: express.Response) => {
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
  const { name, year, config, status } = req.body as {
    name?: string;
    year?: number;
    config?: any;
    status?: string;
  };
  const updated = await prisma.program.update({
    where: { id },
    data: { name, year, config, status },
  });
  logger.info(id!, `Program updated by ${caller.email}`);
  res.json(updated);
});

router.delete('/programs/:id', async (req: express.Request, res: express.Response) => {
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
