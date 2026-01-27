import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

// Create a program year
router.post('/programs/:programId/years', async (req, res) => {
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
  const { year, startDate, endDate, status, notes, copyFromPreviousYear } = req.body as {
    year?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    notes?: string;
    copyFromPreviousYear?: boolean;
  };
  if (!year) {
    res.status(400).json({ error: 'year required' });
    return;
  }

  // Create the new program year
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

  // If copyFromPreviousYear is true, find most recent year and copy activations
  if (copyFromPreviousYear) {
    // Find the most recent program year (excluding the one we just created)
    const mostRecentYear = await prisma.programYear.findFirst({
      where: {
        programId,
        year: { lt: year } // Find years before the one we're creating
      },
      orderBy: { year: 'desc' },
      include: {
        groupings: true,
        parties: true,
        programYearPositions: true,
      },
    });

    if (mostRecentYear) {
      // Copy groupings
      if (mostRecentYear.groupings.length > 0) {
        await prisma.programYearGrouping.createMany({
          data: mostRecentYear.groupings.map((g) => ({
            programYearId: py.id,
            groupingId: g.groupingId,
            status: g.status,
          })),
        });
      }

      // Copy parties
      if (mostRecentYear.parties.length > 0) {
        await prisma.programYearParty.createMany({
          data: mostRecentYear.parties.map((p) => ({
            programYearId: py.id,
            partyId: p.partyId,
            status: p.status,
          })),
        });
      }

      // Copy positions
      if (mostRecentYear.programYearPositions.length > 0) {
        await prisma.programYearPosition.createMany({
          data: mostRecentYear.programYearPositions.map((p) => ({
            programYearId: py.id,
            positionId: p.positionId,
            groupingId: p.groupingId,
            isElected: p.isElected,
            status: p.status,
          })),
        });
      }

      logger.info(
        programId,
        `Program year ${year} created, copied ${mostRecentYear.groupings.length} groupings, ${mostRecentYear.parties.length} parties, ${mostRecentYear.programYearPositions.length} positions from year ${mostRecentYear.year}`
      );
    } else {
      logger.info(programId, `Program year ${year} created (no previous year found for copying)`);
    }
  } else {
    logger.info(programId, `Program year ${year} created`);
  }

  res.status(201).json(py);
});

// List program years (returns years from Program, ProgramYear table, and Applications)
router.get('/programs/:programId/years', async (req, res) => {
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

  // Get the program itself to include its base year
  const program = await prisma.program.findUnique({
    where: { id: programId },
    select: { year: true },
  });

  // Get years from ProgramYear table (explicitly managed years)
  const programYears = await prisma.programYear.findMany({
    where: { programId },
    select: { year: true },
  });

  // Get distinct years from applications (years with actual applications)
  const applications = await prisma.application.findMany({
    where: { programId, year: { not: null } },
    select: { year: true },
    distinct: ['year'],
  });

  // Merge and deduplicate years from all sources (including program's base year)
  const yearSet = new Set<number>();
  if (program?.year) yearSet.add(program.year);
  programYears.forEach(py => yearSet.add(py.year));
  applications.forEach(app => { if (app.year) yearSet.add(app.year); });

  // Sort descending and return in format expected by frontend
  const years = Array.from(yearSet).sort((a, b) => b - a);
  res.json(years.map(year => ({ year })));
});

// Get a program year
router.get('/program-years/:id', async (req, res) => {
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
  res.json(py);
});

// Update a program year
router.put('/program-years/:id', async (req, res) => {
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

// Archive a program year
router.delete('/program-years/:id', async (req, res) => {
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
  const updated = await prisma.programYear.update({
    where: { id: Number(id) },
    data: { status: 'archived' },
  });
  logger.info(py.programId, `Program year ${py.year} archived`);
  res.json(updated);
});

export default router;
