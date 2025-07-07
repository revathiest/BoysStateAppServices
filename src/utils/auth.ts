import prisma from '../prisma';
import * as logger from '../logger';
import express from 'express';

export async function isProgramAdmin(userId: number, programId: string) {
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId, programId },
  });
  return assignment?.role === 'admin';
}

export async function isProgramMember(userId: number, programId: string) {
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId, programId },
  });
  return Boolean(assignment);
}

export async function getUserPrograms(
  req: express.Request,
  res: express.Response,
) {
  const { username } = req.params as { username?: string };
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: username } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: { program: true },
  });
  const programs = assignments.map((a: any) => ({
    programId: a.program.id,
    programName: a.program.name,
    role: a.role,
  }));
  programs.forEach((p: any) => {
    logger.info(p.programId, `Program lookup for ${user.email}`);
  });
  res.json({ username: user.email, programs });
}
