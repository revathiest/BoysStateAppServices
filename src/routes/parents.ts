import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

router.post('/program-years/:id/parents', async (req, res) => {
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

router.get('/program-years/:id/parents', async (req, res) => {
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

router.put('/parents/:id', async (req, res) => {
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

router.delete('/parents/:id', async (req, res) => {
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

router.post('/delegate-parent-links', async (req, res) => {
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

router.put('/delegate-parent-links/:id', async (req, res) => {
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

export default router;
