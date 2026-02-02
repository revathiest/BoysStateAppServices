import prisma from '../prisma';
import * as logger from '../logger';
import express from 'express';
import { ALL_PERMISSIONS, Permission } from './permissions';

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

  res.json({ username: user.email, programs });
}

/**
 * Get all permissions for a user in a specific program.
 * Admins get all permissions automatically.
 * Other users get permissions from their assigned ProgramRole.
 */
export async function getUserPermissions(
  userId: number,
  programId: string
): Promise<string[]> {
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId, programId },
    include: {
      programRole: {
        include: {
          permissions: true,
        },
      },
    },
  });

  if (!assignment) {
    return [];
  }

  // Admins get all permissions
  if (assignment.role === 'admin') {
    return [...ALL_PERMISSIONS];
  }

  // If user has a programRole, return its permissions
  if (assignment.programRole) {
    return assignment.programRole.permissions.map((p: { permission: string }) => p.permission);
  }

  // No role assigned = no permissions
  return [];
}

/**
 * Check if a user has a specific permission in a program.
 */
export async function hasPermission(
  userId: number,
  programId: string,
  permission: Permission | string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId, programId);
  return permissions.includes(permission);
}

/**
 * Get a user's role assignment for a program, including role details.
 */
export async function getUserRoleAssignment(userId: number, programId: string) {
  return prisma.programAssignment.findFirst({
    where: { userId, programId },
    include: {
      programRole: {
        include: {
          permissions: true,
        },
      },
    },
  });
}
