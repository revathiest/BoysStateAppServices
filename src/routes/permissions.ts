import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember, getUserPermissions } from '../utils/auth';
import { ALL_PERMISSIONS, PERMISSION_GROUPS, isValidPermission, getInvalidPermissions } from '../utils/permissions';

const router = express.Router();

// List all available permission keys (for UI)
router.get('/permissions', async (_req, res) => {
  res.json({
    permissions: ALL_PERMISSIONS,
    groups: PERMISSION_GROUPS,
  });
});

// Get current user's permissions for a program
router.get('/programs/:id/my-permissions', async (req, res) => {
  const { id: programId } = req.params;
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }

  const isMember = await isProgramMember(caller.userId, programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const permissions = await getUserPermissions(caller.userId, programId);
  const isAdmin = await isProgramAdmin(caller.userId, programId);

  // Get role assignment for display
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId: caller.userId, programId },
    include: { programRole: true },
  });

  res.json({
    permissions,
    isAdmin,
    roleName: isAdmin ? 'Admin' : (assignment?.programRole?.name || null),
    roleId: assignment?.programRoleId || null,
  });
});

// List all roles for a program (admin only)
router.get('/programs/:id/roles', async (req, res) => {
  const { id: programId } = req.params;
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

  const roles = await prisma.programRole.findMany({
    where: { programId },
    include: {
      permissions: {
        select: { permission: true },
      },
      _count: {
        select: { assignments: true },
      },
    },
    orderBy: { displayOrder: 'asc' },
  });

  // Transform to flatten permissions array
  const transformed = roles.map(role => ({
    id: role.id,
    name: role.name,
    description: role.description,
    isDefault: role.isDefault,
    isActive: role.isActive,
    displayOrder: role.displayOrder,
    permissions: role.permissions.map(p => p.permission),
    assignedCount: role._count.assignments,
  }));

  logger.info(programId, `Listed ${roles.length} roles by ${caller.email}`);
  res.json(transformed);
});

// Create a new role
router.post('/programs/:id/roles', async (req, res) => {
  const { id: programId } = req.params;
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

  const { name, description, permissions } = req.body as {
    name?: string;
    description?: string;
    permissions?: string[];
  };

  if (!name) {
    res.status(400).json({ error: 'name required' });
    return;
  }

  // Validate permissions
  if (permissions && permissions.length > 0) {
    const invalid = getInvalidPermissions(permissions);
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
      return;
    }
  }

  // Check for duplicate name
  const existing = await prisma.programRole.findFirst({
    where: { programId, name },
  });
  if (existing) {
    res.status(409).json({ error: 'Role with this name already exists' });
    return;
  }

  // Get max display order
  const maxOrder = await prisma.programRole.aggregate({
    where: { programId },
    _max: { displayOrder: true },
  });

  const role = await prisma.programRole.create({
    data: {
      programId,
      name,
      description: description || null,
      displayOrder: (maxOrder._max.displayOrder || 0) + 1,
      permissions: permissions && permissions.length > 0
        ? {
            create: permissions.map(p => ({ permission: p })),
          }
        : undefined,
    },
    include: {
      permissions: { select: { permission: true } },
    },
  });

  logger.info(programId, `Created role "${name}" by ${caller.email}`);
  res.status(201).json({
    id: role.id,
    name: role.name,
    description: role.description,
    isDefault: role.isDefault,
    isActive: role.isActive,
    displayOrder: role.displayOrder,
    permissions: role.permissions.map(p => p.permission),
  });
});

// Update a role
router.put('/programs/:id/roles/:roleId', async (req, res) => {
  const { id: programId, roleId } = req.params;
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId || !roleId) {
    res.status(400).json({ error: 'programId and roleId required' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const role = await prisma.programRole.findFirst({
    where: { id: parseInt(roleId), programId },
  });

  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }

  const { name, description, permissions, isActive, displayOrder } = req.body as {
    name?: string;
    description?: string;
    permissions?: string[];
    isActive?: boolean;
    displayOrder?: number;
  };

  // Validate permissions if provided
  if (permissions) {
    const invalid = getInvalidPermissions(permissions);
    if (invalid.length > 0) {
      res.status(400).json({ error: `Invalid permissions: ${invalid.join(', ')}` });
      return;
    }
  }

  // Check for duplicate name if renaming
  if (name && name !== role.name) {
    const existing = await prisma.programRole.findFirst({
      where: { programId, name },
    });
    if (existing) {
      res.status(409).json({ error: 'Role with this name already exists' });
      return;
    }
  }

  // Update role and permissions in transaction
  const updated = await prisma.$transaction(async (tx) => {
    // Update permissions if provided
    if (permissions) {
      // Delete existing permissions
      await tx.programRolePermission.deleteMany({
        where: { roleId: role.id },
      });
      // Create new permissions
      if (permissions.length > 0) {
        await tx.programRolePermission.createMany({
          data: permissions.map(p => ({ roleId: role.id, permission: p })),
        });
      }
    }

    // Update role fields
    return tx.programRole.update({
      where: { id: role.id },
      data: {
        name: name ?? undefined,
        description: description !== undefined ? description : undefined,
        isActive: isActive !== undefined ? isActive : undefined,
        displayOrder: displayOrder !== undefined ? displayOrder : undefined,
      },
      include: {
        permissions: { select: { permission: true } },
      },
    });
  });

  logger.info(programId, `Updated role "${updated.name}" by ${caller.email}`);
  res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    isDefault: updated.isDefault,
    isActive: updated.isActive,
    displayOrder: updated.displayOrder,
    permissions: updated.permissions.map(p => p.permission),
  });
});

// Delete a role
router.delete('/programs/:id/roles/:roleId', async (req, res) => {
  const { id: programId, roleId } = req.params;
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId || !roleId) {
    res.status(400).json({ error: 'programId and roleId required' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const role = await prisma.programRole.findFirst({
    where: { id: parseInt(roleId), programId },
    include: { _count: { select: { assignments: true } } },
  });

  if (!role) {
    res.status(404).json({ error: 'Role not found' });
    return;
  }

  // Don't allow deleting roles with assignments
  if (role._count.assignments > 0) {
    res.status(409).json({
      error: `Cannot delete role with ${role._count.assignments} assigned user(s). Reassign them first.`,
    });
    return;
  }

  // Delete the role (permissions cascade due to onDelete: Cascade)
  await prisma.programRole.delete({
    where: { id: role.id },
  });

  logger.info(programId, `Deleted role "${role.name}" by ${caller.email}`);
  res.json({ success: true, deletedRole: role.name });
});

// Assign a role to a user
router.put('/programs/:id/users/:userId/role', async (req, res) => {
  const { id: programId, userId } = req.params;
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId || !userId) {
    res.status(400).json({ error: 'programId and userId required' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { roleId } = req.body as { roleId?: number | null };

  // Find the user's program assignment
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId: parseInt(userId), programId },
  });

  if (!assignment) {
    res.status(404).json({ error: 'User is not assigned to this program' });
    return;
  }

  // Don't allow changing admin's role
  if (assignment.role === 'admin') {
    res.status(400).json({ error: 'Cannot change role for admin users' });
    return;
  }

  // If roleId is provided, verify it exists in this program
  if (roleId) {
    const role = await prisma.programRole.findFirst({
      where: { id: roleId, programId },
    });
    if (!role) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
  }

  // Update the assignment
  const updated = await prisma.programAssignment.update({
    where: { id: assignment.id },
    data: { programRoleId: roleId || null },
    include: { programRole: true },
  });

  const targetUser = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    select: { email: true },
  });

  logger.info(
    programId,
    `Assigned role "${updated.programRole?.name || 'None'}" to user ${targetUser?.email} by ${caller.email}`
  );

  res.json({
    userId: parseInt(userId),
    programId,
    roleId: updated.programRoleId,
    roleName: updated.programRole?.name || null,
  });
});

export default router;
