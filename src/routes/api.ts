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

router.post(
  '/programs/:programId/grouping-types',
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
    const {
      defaultName,
      customName,
      pluralName,
      levelOrder,
      isRequired,
    } = req.body as {
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
  },
);

router.get(
  '/programs/:programId/grouping-types',
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
    const types = await prisma.groupingType.findMany({
      where: { programId },
      orderBy: { levelOrder: 'asc' },
    });
    res.json(types);
  },
);

router.put('/grouping-types/:id', async (req: express.Request, res: express.Response) => {
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
    data: {
      customName,
      pluralName,
      levelOrder,
      isRequired,
      status,
    },
  });
  logger.info(gt.programId, `GroupingType ${gt.id} updated`);
  res.json(updated);
});

router.delete('/grouping-types/:id', async (req: express.Request, res: express.Response) => {
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

router.post('/programs/:programId/groupings', async (req: express.Request, res: express.Response) => {
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

router.get('/programs/:programId/groupings', async (req: express.Request, res: express.Response) => {
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

router.put('/groupings/:id', async (req: express.Request, res: express.Response) => {
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

router.delete('/groupings/:id', async (req: express.Request, res: express.Response) => {
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

router.post('/program-years/:id/groupings/activate', async (req: express.Request, res: express.Response) => {
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

router.get('/program-years/:id/groupings', async (req: express.Request, res: express.Response) => {
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

router.post('/programs/:programId/parties', async (req: express.Request, res: express.Response) => {
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

router.get('/programs/:programId/parties', async (req: express.Request, res: express.Response) => {
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

router.put('/parties/:id', async (req: express.Request, res: express.Response) => {
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

router.delete('/parties/:id', async (req: express.Request, res: express.Response) => {
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

router.post('/program-years/:id/parties/activate', async (req: express.Request, res: express.Response) => {
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

router.get('/program-years/:id/parties', async (req: express.Request, res: express.Response) => {
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

router.post('/programs/:programId/positions', async (req: express.Request, res: express.Response) => {
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

router.get('/programs/:programId/positions', async (req: express.Request, res: express.Response) => {
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

router.put('/positions/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const position = await prisma.position.findUnique({ where: { id: Number(id) } });
  if (!position) {
    res.status(404).json({ error: 'Not found' });
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

router.delete('/positions/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const position = await prisma.position.findUnique({ where: { id: Number(id) } });
  if (!position) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, position.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.position.update({ where: { id: Number(id) }, data: { status: 'retired' } });
  logger.info(position.programId, `Position ${position.id} retired`);
  res.json(updated);
});

router.post('/program-years/:id/positions', async (req: express.Request, res: express.Response) => {
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

router.get('/program-years/:id/positions', async (req: express.Request, res: express.Response) => {
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

router.put('/program-year-positions/:id', async (req: express.Request, res: express.Response) => {
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

router.delete('/program-year-positions/:id', async (req: express.Request, res: express.Response) => {
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

router.post('/program-years/:id/delegates', async (req: express.Request, res: express.Response) => {
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
  const { firstName, lastName, email, phone, userId, groupingId, partyId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
  };
  if (!firstName || !lastName || !email || !groupingId) {
    res.status(400).json({ error: 'firstName, lastName, email and groupingId required' });
    return;
  }
  const delegate = await prisma.delegate.create({
    data: {
      programYearId: py.id,
      firstName,
      lastName,
      email,
      phone,
      userId,
      groupingId,
      partyId,
      status: 'active',
    },
  });
  logger.info(py.programId, `Delegate ${delegate.id} created`);
  res.status(201).json(delegate);
});

router.get('/program-years/:id/delegates', async (req: express.Request, res: express.Response) => {
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
  const delegates = await prisma.delegate.findMany({ where: { programYearId: py.id } });
  res.json(delegates);
});

router.put('/delegates/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, groupingId, partyId, status } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
    status?: string;
  };
  const updated = await prisma.delegate.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, groupingId, partyId, status },
  });
  logger.info(py.programId, `Delegate ${delegate.id} updated`);
  res.json(updated);
});

router.delete('/delegates/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.delegate.update({
    where: { id: Number(id) },
    data: { status: 'withdrawn' },
  });
  logger.info(py.programId, `Delegate ${delegate.id} withdrawn`);
  res.json(updated);
});

router.post('/program-years/:id/staff', async (req: express.Request, res: express.Response) => {
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
  const { firstName, lastName, email, phone, userId, role, groupingId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    role?: string;
    groupingId?: number;
  };
  if (!firstName || !lastName || !email || !role) {
    res.status(400).json({ error: 'firstName, lastName, email and role required' });
    return;
  }
  const staff = await prisma.staff.create({
    data: {
      programYearId: py.id,
      firstName,
      lastName,
      email,
      phone,
      userId,
      role,
      groupingId,
      status: 'active',
    },
  });
  logger.info(py.programId, `Staff ${staff.id} created`);
  res.status(201).json(staff);
});

router.get('/program-years/:id/staff', async (req: express.Request, res: express.Response) => {
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
  const staffList = await prisma.staff.findMany({ where: { programYearId: py.id } });
  res.json(staffList);
});

router.put('/staff/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, role, groupingId, status } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    role?: string;
    groupingId?: number;
    status?: string;
  };
  const updated = await prisma.staff.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, role, groupingId, status },
  });
  logger.info(py.programId, `Staff ${staff.id} updated`);
  res.json(updated);
});

router.delete('/staff/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const staff = await prisma.staff.findUnique({ where: { id: Number(id) } });
  if (!staff) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: staff.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.staff.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
  logger.info(py.programId, `Staff ${staff.id} removed`);
  res.json(updated);
});

router.post('/program-years/:id/parents', async (req: express.Request, res: express.Response) => {
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
  const { firstName, lastName, email, phone, userId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
  };
  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: 'firstName, lastName, and email required' });
    return;
  }
  const parent = await prisma.parent.create({
    data: {
      programYearId: py.id,
      firstName,
      lastName,
      email,
      phone,
      userId,
      status: 'active',
    },
  });
  logger.info(py.programId, `Parent ${parent.id} created`);
  res.status(201).json(parent);
});

router.get('/program-years/:id/parents', async (req: express.Request, res: express.Response) => {
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
  const parents = await prisma.parent.findMany({ where: { programYearId: py.id } });
  res.json(parents);
});

router.put('/parents/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const parent = await prisma.parent.findUnique({ where: { id: Number(id) } });
  if (!parent) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: parent.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, status } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    status?: string;
  };
  const updated = await prisma.parent.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, status },
  });
  logger.info(py.programId, `Parent ${parent.id} updated`);
  res.json(updated);
});

router.delete('/parents/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const parent = await prisma.parent.findUnique({ where: { id: Number(id) } });
  if (!parent) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: parent.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.parent.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
  logger.info(py.programId, `Parent ${parent.id} removed`);
  res.json(updated);
});

router.post('/delegate-parent-links', async (req: express.Request, res: express.Response) => {
  const caller = (req as any).user as { userId: number };
  const { delegateId, parentId, programYearId } = req.body as {
    delegateId?: number;
    parentId?: number;
    programYearId?: number;
  };
  if (!delegateId || !parentId || !programYearId) {
    res.status(400).json({ error: 'delegateId, parentId and programYearId required' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const link = await prisma.delegateParentLink.create({
    data: { delegateId, parentId, programYearId, status: 'pending' },
  });
  logger.info(py.programId, `Link ${link.id} created`);
  res.status(201).json(link);
});

router.put('/delegate-parent-links/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const link = await prisma.delegateParentLink.findUnique({ where: { id: Number(id) } });
  if (!link) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: link.programYearId } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { status } = req.body as { status?: string };
  const updated = await prisma.delegateParentLink.update({ where: { id: Number(id) }, data: { status } });
  logger.info(py.programId, `Link ${link.id} updated`);
  res.json(updated);
});

router.post('/program-years/:id/elections', async (req: express.Request, res: express.Response) => {
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

router.get('/program-years/:id/elections', async (req: express.Request, res: express.Response) => {
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

router.put('/elections/:id', async (req: express.Request, res: express.Response) => {
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

router.delete('/elections/:id', async (req: express.Request, res: express.Response) => {
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

router.post('/elections/:id/vote', async (req: express.Request, res: express.Response) => {
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

router.get('/elections/:id/results', async (req: express.Request, res: express.Response) => {
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
