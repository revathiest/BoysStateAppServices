import express from "express";
import prisma from "../prisma";
import * as logger from "../logger";
import { isProgramAdmin, isProgramMember } from "../utils/auth";
const router = express.Router();

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

export default router;
