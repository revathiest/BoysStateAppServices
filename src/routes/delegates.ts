import express from 'express';
import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const scryptAsync = promisify(scrypt);

// Hash a password using scrypt (same as auth.ts)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

const router = express.Router();

// Helper function to get a grouping and all its descendants (for hierarchical filtering)
async function getGroupingWithDescendants(groupingId: number): Promise<number[]> {
  const result: number[] = [groupingId];

  // Get all groupings that have this grouping as their parent
  const children = await prisma.grouping.findMany({
    where: { parentGroupingId: groupingId },
    select: { id: true },
  });

  // Recursively get descendants of each child
  for (const child of children) {
    const childDescendants = await getGroupingWithDescendants(child.id);
    result.push(...childDescendants);
  }

  return result;
}

router.post('/program-years/:id/delegates', async (req, res) => {
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
  const { firstName, lastName, email, phone, userId, groupingId, partyId } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
  };
  if (!firstName || !lastName || !email) {
    res.status(400).json({ error: 'firstName, lastName and email required' });
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

router.get('/program-years/:id/delegates', async (req, res) => {
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

  // Parse query parameters for filtering, searching, and pagination
  const {
    search,
    groupingId,
    partyId,
    status,
    page = '1',
    pageSize = '50',
    sort = 'lastName',
    order = 'asc',
  } = req.query as {
    search?: string;
    groupingId?: string;
    partyId?: string;
    status?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    order?: string;
  };

  // Build where clause
  const where: any = { programYearId: py.id };

  // Search by name or email (case-insensitive)
  if (search && search.trim()) {
    const searchTerm = search.trim();
    where.OR = [
      { firstName: { contains: searchTerm, mode: 'insensitive' } },
      { lastName: { contains: searchTerm, mode: 'insensitive' } },
      { email: { contains: searchTerm, mode: 'insensitive' } },
    ];
  }

  // Filter by grouping (includes all descendant groupings for hierarchical filtering)
  if (groupingId) {
    if (groupingId === 'unassigned') {
      where.groupingId = null;
    } else {
      // Get the selected grouping and all its descendants
      const selectedGroupingId = Number(groupingId);
      const allGroupingIds = await getGroupingWithDescendants(selectedGroupingId);
      where.groupingId = { in: allGroupingIds };
    }
  }

  // Filter by party
  if (partyId) {
    if (partyId === 'unassigned') {
      where.partyId = null;
    } else {
      where.partyId = Number(partyId);
    }
  }

  // Filter by status
  if (status && status !== 'all') {
    where.status = status;
  }

  // Pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
  const skip = (pageNum - 1) * pageSizeNum;

  // Sorting - validate sort field
  const validSortFields = ['firstName', 'lastName', 'email', 'status', 'createdAt'];
  const sortField = validSortFields.includes(sort) ? sort : 'lastName';
  const sortOrder = order === 'desc' ? 'desc' : 'asc';

  // Get total count for pagination
  const total = await prisma.delegate.count({ where });

  // Fetch delegates with relations
  const delegates = await prisma.delegate.findMany({
    where,
    include: {
      grouping: {
        select: { id: true, name: true, groupingType: { select: { id: true, defaultName: true, customName: true } } },
      },
      party: {
        select: { id: true, party: { select: { id: true, name: true, abbreviation: true, color: true } } },
      },
    },
    orderBy: { [sortField]: sortOrder },
    skip,
    take: pageSizeNum,
  });

  res.json({
    delegates,
    total,
    page: pageNum,
    pageSize: pageSizeNum,
    totalPages: Math.ceil(total / pageSizeNum),
  });
});

router.put('/delegates/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { firstName, lastName, email, phone, userId, groupingId, partyId, status, tempPassword } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    userId?: number;
    groupingId?: number;
    partyId?: number;
    status?: string;
    tempPassword?: string;
  };

  // If tempPassword provided and delegate has a userId, update the user's password
  if (tempPassword && delegate.userId) {
    const hashedPassword = await hashPassword(tempPassword);
    await prisma.user.update({
      where: { id: delegate.userId },
      data: { password: hashedPassword },
    });
    logger.info(py.programId, `Password updated for delegate ${delegate.id}`);
  }

  const updated = await prisma.delegate.update({
    where: { id: Number(id) },
    data: { firstName, lastName, email, phone, userId, groupingId, partyId, status },
  });
  logger.info(py.programId, `Delegate ${delegate.id} updated`);
  res.json(updated);
});

router.delete('/delegates/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const delegate = await prisma.delegate.findUnique({ where: { id: Number(id) } });
  if (!delegate) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: delegate.programYearId } });
  if (!py) {
    res.status(204).end();
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

// Fisher-Yates shuffle algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Preview random assignment (dry run)
router.post('/program-years/:id/delegates/assign/preview', async (req, res) => {
  const { id } = req.params as { id: string };
  const caller = (req as any).user as { userId: number };

  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Program year not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Get active groupings for this program year (dedupe by groupingId in case of duplicates)
  // Only include groupings whose type has isRequired=true (delegate assignment level)
  const allActiveGroupings = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: {
      grouping: {
        include: { groupingType: true },
      },
    },
  });

  // Deduplicate by groupingId (underlying Grouping, not ProgramYearGrouping)
  // AND filter to only groupings whose type has isRequired=true
  const seenGroupingIds = new Set<number>();
  const activeGroupings = allActiveGroupings.filter(g => {
    // Skip if groupingType doesn't have isRequired set
    if (!g.grouping.groupingType?.isRequired) {
      return false;
    }
    if (seenGroupingIds.has(g.groupingId)) {
      return false;
    }
    seenGroupingIds.add(g.groupingId);
    return true;
  });

  if (activeGroupings.length === 0) {
    res.status(400).json({ error: 'No groupings found at a delegate assignment level. Please mark an organizational level with "Assign delegates to this level" in Groupings configuration.' });
    return;
  }

  // Get active parties for this program year (dedupe by partyId in case of duplicates)
  const allActiveParties = await prisma.programYearParty.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { party: true },
  });

  // Deduplicate by partyId (underlying Party, not ProgramYearParty)
  const seenPartyIds = new Set<number>();
  const activeParties = allActiveParties.filter(p => {
    if (seenPartyIds.has(p.partyId)) {
      return false;
    }
    seenPartyIds.add(p.partyId);
    return true;
  });

  if (activeParties.length === 0) {
    res.status(400).json({ error: 'No active parties found for this program year. Please activate parties in Year Configuration first.' });
    return;
  }

  // Get all delegates for this program year
  const allDelegates = await prisma.delegate.findMany({
    where: {
      programYearId: py.id,
      status: { not: 'withdrawn' },
    },
  });

  // Separate assigned and unassigned delegates
  const unassignedDelegates = allDelegates.filter(d => d.groupingId === null || d.partyId === null);
  const assignedDelegates = allDelegates.filter(d => d.groupingId !== null && d.partyId !== null);

  if (unassignedDelegates.length === 0) {
    res.status(400).json({ error: 'No unassigned delegates found. All delegates already have grouping and party assignments.' });
    return;
  }

  // Build assignment tracking structure
  // Map: groupingId -> { partyId -> count }
  const assignmentCounts: Map<number, Map<number, number>> = new Map();

  // Initialize counts for all grouping-party combinations
  for (const g of activeGroupings) {
    const partyCountMap = new Map<number, number>();
    for (const p of activeParties) {
      partyCountMap.set(p.id, 0);
    }
    assignmentCounts.set(g.groupingId, partyCountMap);
  }

  // Count existing assignments
  for (const d of assignedDelegates) {
    if (d.groupingId && d.partyId) {
      const partyMap = assignmentCounts.get(d.groupingId);
      if (partyMap && partyMap.has(d.partyId)) {
        partyMap.set(d.partyId, (partyMap.get(d.partyId) || 0) + 1);
      }
    }
  }

  // Calculate total delegates per grouping
  const groupingTotals: Map<number, number> = new Map();
  for (const [groupingId, partyMap] of assignmentCounts) {
    let total = 0;
    for (const count of partyMap.values()) {
      total += count;
    }
    groupingTotals.set(groupingId, total);
  }

  // Shuffle unassigned delegates
  const shuffledDelegates = shuffleArray(unassignedDelegates);

  // Simulate assignments
  const previewAssignments: {
    delegateId: number;
    delegateName: string;
    groupingId: number;
    groupingName: string;
    partyId: number;
    partyName: string;
  }[] = [];

  for (const delegate of shuffledDelegates) {
    // Find grouping with lowest total count
    let minGroupingId: number | null = null;
    let minCount = Infinity;

    for (const [groupingId, total] of groupingTotals) {
      if (total < minCount) {
        minCount = total;
        minGroupingId = groupingId;
      }
    }

    if (minGroupingId === null) continue;

    // Within that grouping, find party with lowest count
    const partyMap = assignmentCounts.get(minGroupingId)!;
    let minPartyId: number | null = null;
    let minPartyCount = Infinity;

    for (const [partyId, count] of partyMap) {
      if (count < minPartyCount) {
        minPartyCount = count;
        minPartyId = partyId;
      }
    }

    if (minPartyId === null) continue;

    // Get names for preview
    const grouping = activeGroupings.find(g => g.groupingId === minGroupingId);
    const party = activeParties.find(p => p.id === minPartyId);

    // Record assignment
    previewAssignments.push({
      delegateId: delegate.id,
      delegateName: `${delegate.firstName} ${delegate.lastName}`,
      groupingId: minGroupingId,
      groupingName: grouping?.grouping.name || 'Unknown',
      partyId: minPartyId,
      partyName: party?.party.name || 'Unknown',
    });

    // Update counts
    partyMap.set(minPartyId, (partyMap.get(minPartyId) || 0) + 1);
    groupingTotals.set(minGroupingId, (groupingTotals.get(minGroupingId) || 0) + 1);
  }

  // Build summary by grouping and party
  const summary: {
    groupingId: number;
    groupingName: string;
    parties: {
      partyId: number;
      partyName: string;
      partyColor: string;
      existingCount: number;
      newCount: number;
      totalCount: number;
    }[];
    totalExisting: number;
    totalNew: number;
    totalCount: number;
  }[] = [];

  for (const g of activeGroupings) {
    const partyMap = assignmentCounts.get(g.groupingId);
    if (!partyMap) continue;

    const partySummary = [];
    let groupTotalExisting = 0;
    let groupTotalNew = 0;

    for (const p of activeParties) {
      const totalCount = partyMap.get(p.id) || 0;
      // Count how many were existing vs new
      const existingCount = assignedDelegates.filter(
        d => d.groupingId === g.groupingId && d.partyId === p.id
      ).length;
      const newCount = totalCount - existingCount;

      groupTotalExisting += existingCount;
      groupTotalNew += newCount;

      partySummary.push({
        partyId: p.id,
        partyName: p.party.name,
        partyColor: p.party.color || '#888888',
        existingCount,
        newCount,
        totalCount,
      });
    }

    summary.push({
      groupingId: g.groupingId,
      groupingName: g.grouping.name,
      parties: partySummary,
      totalExisting: groupTotalExisting,
      totalNew: groupTotalNew,
      totalCount: groupTotalExisting + groupTotalNew,
    });
  }

  res.json({
    totalDelegates: allDelegates.length,
    alreadyAssigned: assignedDelegates.length,
    toBeAssigned: unassignedDelegates.length,
    groupings: activeGroupings.length,
    parties: activeParties.length,
    summary,
    assignments: previewAssignments.slice(0, 50), // Limit preview to first 50
  });
});

// Execute random assignment
router.post('/program-years/:id/delegates/assign', async (req, res) => {
  const { id } = req.params as { id: string };
  const caller = (req as any).user as { userId: number };

  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Program year not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Get active groupings for this program year (dedupe by groupingId in case of duplicates)
  // Only include groupings whose type has isRequired=true (delegate assignment level)
  const allActiveGroupingsExec = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: {
      grouping: {
        include: { groupingType: true },
      },
    },
  });

  // Deduplicate by groupingId
  // AND filter to only groupings whose type has isRequired=true
  const seenGroupingIdsExec = new Set<number>();
  const activeGroupings = allActiveGroupingsExec.filter(g => {
    // Skip if groupingType doesn't have isRequired set
    if (!g.grouping.groupingType?.isRequired) {
      return false;
    }
    if (seenGroupingIdsExec.has(g.groupingId)) {
      return false;
    }
    seenGroupingIdsExec.add(g.groupingId);
    return true;
  });

  if (activeGroupings.length === 0) {
    res.status(400).json({ error: 'No groupings found at a delegate assignment level' });
    return;
  }

  // Get active parties for this program year (dedupe by partyId in case of duplicates)
  const allActivePartiesExec = await prisma.programYearParty.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { party: true },
  });

  // Deduplicate by partyId (underlying Party, not ProgramYearParty)
  const seenPartyIdsExec = new Set<number>();
  const activeParties = allActivePartiesExec.filter(p => {
    if (seenPartyIdsExec.has(p.partyId)) {
      return false;
    }
    seenPartyIdsExec.add(p.partyId);
    return true;
  });

  if (activeParties.length === 0) {
    res.status(400).json({ error: 'No active parties found for this program year' });
    return;
  }

  // Get all non-withdrawn delegates
  const allDelegates = await prisma.delegate.findMany({
    where: {
      programYearId: py.id,
      status: { not: 'withdrawn' },
    },
  });

  // Find unassigned delegates
  const unassignedDelegates = allDelegates.filter(d => d.groupingId === null || d.partyId === null);
  const assignedDelegates = allDelegates.filter(d => d.groupingId !== null && d.partyId !== null);

  if (unassignedDelegates.length === 0) {
    res.status(400).json({ error: 'No unassigned delegates found' });
    return;
  }

  // Build assignment tracking structure
  const assignmentCounts: Map<number, Map<number, number>> = new Map();

  for (const g of activeGroupings) {
    const partyCountMap = new Map<number, number>();
    for (const p of activeParties) {
      partyCountMap.set(p.id, 0);
    }
    assignmentCounts.set(g.groupingId, partyCountMap);
  }

  // Count existing assignments
  for (const d of assignedDelegates) {
    if (d.groupingId && d.partyId) {
      const partyMap = assignmentCounts.get(d.groupingId);
      if (partyMap && partyMap.has(d.partyId)) {
        partyMap.set(d.partyId, (partyMap.get(d.partyId) || 0) + 1);
      }
    }
  }

  // Calculate totals per grouping
  const groupingTotals: Map<number, number> = new Map();
  for (const [groupingId, partyMap] of assignmentCounts) {
    let total = 0;
    for (const count of partyMap.values()) {
      total += count;
    }
    groupingTotals.set(groupingId, total);
  }

  // Shuffle and assign
  const shuffledDelegates = shuffleArray(unassignedDelegates);
  const results = {
    assigned: 0,
    failed: 0,
    errors: [] as { delegateId: number; error: string }[],
  };

  for (const delegate of shuffledDelegates) {
    try {
      // Find grouping with lowest count
      let minGroupingId: number | null = null;
      let minCount = Infinity;

      for (const [groupingId, total] of groupingTotals) {
        if (total < minCount) {
          minCount = total;
          minGroupingId = groupingId;
        }
      }

      if (minGroupingId === null) {
        results.failed++;
        results.errors.push({ delegateId: delegate.id, error: 'No grouping available' });
        continue;
      }

      // Find party with lowest count in that grouping
      const partyMap = assignmentCounts.get(minGroupingId)!;
      let minPartyId: number | null = null;
      let minPartyCount = Infinity;

      for (const [partyId, count] of partyMap) {
        if (count < minPartyCount) {
          minPartyCount = count;
          minPartyId = partyId;
        }
      }

      if (minPartyId === null) {
        results.failed++;
        results.errors.push({ delegateId: delegate.id, error: 'No party available' });
        continue;
      }

      // Update delegate
      await prisma.delegate.update({
        where: { id: delegate.id },
        data: {
          groupingId: minGroupingId,
          partyId: minPartyId,
          status: delegate.status === 'pending_assignment' ? 'active' : delegate.status,
        },
      });

      // Update tracking counts
      partyMap.set(minPartyId, (partyMap.get(minPartyId) || 0) + 1);
      groupingTotals.set(minGroupingId, (groupingTotals.get(minGroupingId) || 0) + 1);

      results.assigned++;

      logger.info(
        py.programId,
        `Delegate ${delegate.id} (${delegate.firstName} ${delegate.lastName}) assigned to grouping ${minGroupingId}, party ${minPartyId}`
      );
    } catch (err: any) {
      results.failed++;
      results.errors.push({ delegateId: delegate.id, error: err.message || 'Unknown error' });
      logger.error(py.programId, `Failed to assign delegate ${delegate.id}`, err);
    }
  }

  logger.info(
    py.programId,
    `Random assignment completed: ${results.assigned} assigned, ${results.failed} failed`
  );

  res.json(results);
});

export default router;
