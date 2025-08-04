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
    res.status(204).end();
    return;
  }

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: { program: true },
  });
  let programs = assignments.map((a: any) => ({
    programId: a.program.id,
    programName: a.program.name,
    role: a.role,
  }));

  const hasDevProgram = assignments.some(
    (a: any) => a.program.name === 'DEVELOPMENT',
  );

  if (hasDevProgram) {
    const allPrograms = await prisma.program.findMany();
    programs = allPrograms.map((prog: any) => {
      const assigned = assignments.find(
        (a: any) => a.program.id === prog.id,
      );
      return {
        programId: prog.id,
        programName: prog.name,
        role: assigned ? assigned.role : 'developer',
      };
    });
  }

  programs.forEach((p: any) => {
    logger.info(p.programId, `Program lookup for ${user.email}`);
  });
  res.json({ username: user.email, programs });
}
