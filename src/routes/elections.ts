import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

// ============================================================
// ELECTION MANAGEMENT
// ============================================================

// Create a single election
router.post('/program-years/:id/elections', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
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
  const { positionId, groupingId, electionType, method, startTime, endTime } = req.body as {
    positionId?: number;
    groupingId?: number;
    electionType?: string;
    method?: string;
    startTime?: string;
    endTime?: string;
  };
  if (!positionId || !groupingId) {
    res.status(400).json({ error: 'positionId and groupingId required' });
    return;
  }
  const election = await prisma.election.create({
    data: {
      programYearId: py.id,
      positionId,
      groupingId,
      electionType: electionType || null,
      method: method || null,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      status: 'nomination',
    },
  });
  logger.info(py.programId, `Election ${election.id} created by ${caller.email}`);
  res.status(201).json(election);
});

// Open elections for a level - creates elections for all elected positions at a grouping level
router.post('/program-years/:id/elections/open-level', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
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

  const { groupingTypeId, positionIds } = req.body as {
    groupingTypeId?: number;
    positionIds?: number[]; // Optional: specific positions to open (otherwise all elected at level)
  };

  if (!groupingTypeId) {
    res.status(400).json({ error: 'groupingTypeId required' });
    return;
  }

  // Get the grouping type to find ballot-level positions
  const groupingType = await prisma.groupingType.findUnique({
    where: { id: groupingTypeId },
  });
  if (!groupingType || groupingType.programId !== py.programId) {
    res.status(400).json({ error: 'Invalid grouping type' });
    return;
  }

  // Get groupings that are ACTIVE for this program year (via ProgramYearGrouping)
  const activeYearGroupings = await prisma.programYearGrouping.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
      grouping: {
        groupingTypeId: groupingTypeId,
        status: 'active',
      },
    },
    include: {
      grouping: true,
    },
  });

  const groupings = activeYearGroupings.map(pyg => pyg.grouping);

  if (groupings.length === 0) {
    res.status(400).json({ error: 'No active groupings found for this level in the current year. Please activate groupings in Year Configuration first.' });
    return;
  }

  // Get positions that are ACTIVE for this program year (via ProgramYearPosition)
  // and are elected positions with ballots at this level
  const activeYearPositions = await prisma.programYearPosition.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
      position: {
        isElected: true,
        status: 'active',
        OR: [
          { groupingTypeId: groupingTypeId, ballotGroupingTypeId: null },
          { ballotGroupingTypeId: groupingTypeId },
        ],
      },
    },
    include: {
      position: true,
    },
  });

  // Filter to specific positions if requested
  let filteredPositions = activeYearPositions;
  if (positionIds && positionIds.length > 0) {
    filteredPositions = activeYearPositions.filter(pyp => positionIds.includes(pyp.position.id));
  }

  if (filteredPositions.length === 0) {
    res.status(400).json({ error: 'No active elected positions found for this level in the current year. Please activate positions in Year Configuration first.' });
    return;
  }

  // Create elections for each position/grouping combination
  const createdElections: any[] = [];
  const errors: string[] = [];

  for (const pyPosition of filteredPositions) {
    const position = pyPosition.position;

    // Create elections for each grouping at this level
    let electionGroupings = groupings;

    // For positions that belong to a different level but are voted on at this level
    // (e.g., State Senator voted on County ballot), we still create one election per grouping
    // The groupingId on the election represents WHERE the voting happens

    for (const grouping of electionGroupings) {
      // Check if election already exists
      const existing = await prisma.election.findFirst({
        where: {
          programYearId: py.id,
          positionId: pyPosition.id,
          groupingId: grouping.id,
          status: { not: 'archived' },
        },
      });

      if (existing) {
        errors.push(`Election already exists for ${position.name} in ${grouping.name}`);
        continue;
      }

      // Determine election type based on position
      // For partisan positions, we may create primary elections
      // For non-partisan, we create general elections only
      const electionType = position.isNonPartisan ? 'general' : 'primary';

      const election = await prisma.election.create({
        data: {
          programYearId: py.id,
          positionId: pyPosition.id,
          groupingId: grouping.id,
          electionType,
          status: 'nomination',
        },
      });

      createdElections.push({
        ...election,
        positionName: position.name,
        groupingName: grouping.name,
      });
    }
  }

  logger.info(py.programId, `Opened ${createdElections.length} elections for level ${groupingType.defaultName} by ${caller.email}`);

  res.status(201).json({
    created: createdElections.length,
    elections: createdElections,
    errors: errors.length > 0 ? errors : undefined,
  });
});

// Get all elections for a program year
router.get('/program-years/:id/elections', async (req, res) => {
  const { id } = req.params as { id?: string };
  const { status, groupingTypeId, groupingId } = req.query as {
    status?: string;
    groupingTypeId?: string;
    groupingId?: string;
  };
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

  // Build query
  const where: any = { programYearId: py.id };
  if (status) {
    where.status = status;
  }
  if (groupingId) {
    where.groupingId = parseInt(groupingId);
  }

  const elections = await prisma.election.findMany({
    where,
    include: {
      position: {
        include: {
          position: true, // The actual Position
        },
      },
      grouping: {
        include: {
          groupingType: true,
        },
      },
      candidates: {
        include: {
          delegate: true,
          party: {
            include: {
              party: true,
            },
          },
        },
      },
      _count: {
        select: { candidates: true, votes: true },
      },
    },
    orderBy: [
      { grouping: { groupingType: { levelOrder: 'asc' } } },
      { position: { position: { displayOrder: 'asc' } } },
    ],
  });

  // If filtering by groupingTypeId, filter after the query
  let filtered = elections;
  if (groupingTypeId) {
    const typeId = parseInt(groupingTypeId);
    filtered = elections.filter(e => e.grouping?.groupingType?.id === typeId);
  }

  res.json(filtered);
});

// Get a single election with full details
router.get('/elections/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      position: {
        include: {
          position: true,
        },
      },
      grouping: {
        include: {
          groupingType: true,
        },
      },
      candidates: {
        include: {
          delegate: true,
          party: {
            include: {
              party: true,
            },
          },
          nominatedBy: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(election);
});

// Update election
router.put('/elections/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { status, electionType, method, startTime, endTime } = req.body as {
    status?: string;
    electionType?: string;
    method?: string;
    startTime?: string;
    endTime?: string;
  };
  const updated = await prisma.election.update({
    where: { id: Number(id) },
    data: {
      status,
      electionType,
      method,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
    },
  });
  logger.info(py.programId, `Election ${election.id} updated by ${caller.email}`);
  res.json(updated);
});

// Close nominations for all elections at a level (batch operation)
router.post('/program-years/:id/elections/close-nominations', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
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

  const { groupingTypeId, electionIds } = req.body as {
    groupingTypeId?: number; // Close all nominations at this level
    electionIds?: number[]; // Or close specific elections
  };

  // Build the where clause
  const where: any = {
    programYearId: py.id,
    status: 'nomination',
  };

  if (electionIds && electionIds.length > 0) {
    where.id = { in: electionIds };
  } else if (groupingTypeId) {
    // Get all groupings at this level
    const groupings = await prisma.grouping.findMany({
      where: {
        programId: py.programId,
        groupingTypeId: groupingTypeId,
      },
      select: { id: true },
    });
    where.groupingId = { in: groupings.map(g => g.id) };
  }

  // Update all matching elections
  const result = await prisma.election.updateMany({
    where,
    data: { status: 'scheduled' },
  });

  logger.info(py.programId, `Closed nominations for ${result.count} elections by ${caller.email}`);

  res.json({
    closed: result.count,
    message: `Nominations closed for ${result.count} election${result.count !== 1 ? 's' : ''}.`,
  });
});

// Archive (soft delete) election
router.delete('/elections/:id', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.election.update({ where: { id: Number(id) }, data: { status: 'archived' } });
  logger.info(py.programId, `Election ${election.id} archived by ${caller.email}`);
  res.json(updated);
});

// ============================================================
// CANDIDATE MANAGEMENT
// ============================================================

// Add candidate to election (nomination)
router.post('/elections/:id/candidates', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      position: {
        include: { position: true },
      },
    },
  });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }

  // Check if user is a program member (staff can nominate)
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Check if election is accepting nominations
  if (election.status !== 'nomination') {
    res.status(400).json({ error: 'Election is not accepting nominations' });
    return;
  }

  const { delegateId, partyId } = req.body as {
    delegateId?: number;
    partyId?: number;
  };

  if (!delegateId) {
    res.status(400).json({ error: 'delegateId required' });
    return;
  }

  // Verify delegate exists and is in the program year
  const delegate = await prisma.delegate.findUnique({
    where: { id: delegateId },
  });
  if (!delegate || delegate.programYearId !== py.id) {
    res.status(400).json({ error: 'Invalid delegate' });
    return;
  }

  // For primary elections, partyId is required
  if (election.electionType === 'primary' && !partyId) {
    // Use delegate's party if not specified
    if (!delegate.partyId) {
      res.status(400).json({ error: 'Party required for primary election (delegate has no party assigned)' });
      return;
    }
  }

  // Get staff record for the caller (to track who nominated)
  const staff = await prisma.staff.findFirst({
    where: {
      programYearId: py.id,
      userId: caller.userId,
      status: 'active',
    },
  });

  // Check if delegate is already a candidate
  const existingCandidate = await prisma.electionCandidate.findUnique({
    where: {
      electionId_delegateId: {
        electionId: election.id,
        delegateId,
      },
    },
  });

  if (existingCandidate) {
    res.status(400).json({ error: 'Delegate is already a candidate for this election' });
    return;
  }

  // Determine party to use
  const finalPartyId = partyId || delegate.partyId;

  const candidate = await prisma.electionCandidate.create({
    data: {
      electionId: election.id,
      delegateId,
      partyId: finalPartyId,
      nominatedByStaffId: staff?.id,
      status: 'nominated',
    },
    include: {
      delegate: true,
      party: {
        include: { party: true },
      },
      nominatedBy: true,
    },
  });

  logger.info(py.programId, `Candidate ${delegate.firstName} ${delegate.lastName} nominated for election ${election.id} by ${caller.email}`);
  res.status(201).json(candidate);
});

// Get candidates for an election
router.get('/elections/:id/candidates', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const candidates = await prisma.electionCandidate.findMany({
    where: { electionId: election.id },
    include: {
      delegate: true,
      party: {
        include: { party: true },
      },
      nominatedBy: true,
    },
    orderBy: [
      { party: { party: { displayOrder: 'asc' } } },
      { delegate: { lastName: 'asc' } },
    ],
  });

  res.json(candidates);
});

// Update candidate (status, requirements verification)
router.put('/elections/:electionId/candidates/:candidateId', async (req, res) => {
  const { electionId, candidateId } = req.params as { electionId?: string; candidateId?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const candidate = await prisma.electionCandidate.findUnique({
    where: { id: Number(candidateId) },
    include: {
      election: true,
      delegate: true,
    },
  });

  if (!candidate || candidate.electionId !== Number(electionId)) {
    res.status(204).end();
    return;
  }

  const py = await prisma.programYear.findUnique({ where: { id: candidate.election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const {
    status,
    declarationReceived,
    petitionVerified,
    petitionSignatureCount,
  } = req.body as {
    status?: string;
    declarationReceived?: boolean;
    petitionVerified?: boolean;
    petitionSignatureCount?: number;
  };

  const updateData: any = {};
  if (status !== undefined) updateData.status = status;
  if (declarationReceived !== undefined) {
    updateData.declarationReceived = declarationReceived;
    if (declarationReceived) {
      updateData.declarationReceivedAt = new Date();
    }
  }
  if (petitionVerified !== undefined) {
    updateData.petitionVerified = petitionVerified;
    if (petitionVerified) {
      updateData.petitionVerifiedAt = new Date();
    }
  }
  if (petitionSignatureCount !== undefined) {
    updateData.petitionSignatureCount = petitionSignatureCount;
  }

  const updated = await prisma.electionCandidate.update({
    where: { id: Number(candidateId) },
    data: updateData,
    include: {
      delegate: true,
      party: {
        include: { party: true },
      },
      nominatedBy: true,
    },
  });

  logger.info(py.programId, `Candidate ${candidate.delegate.firstName} ${candidate.delegate.lastName} updated for election ${electionId} by ${caller.email}`);
  res.json(updated);
});

// Remove candidate (withdraw nomination)
router.delete('/elections/:electionId/candidates/:candidateId', async (req, res) => {
  const { electionId, candidateId } = req.params as { electionId?: string; candidateId?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const candidate = await prisma.electionCandidate.findUnique({
    where: { id: Number(candidateId) },
    include: {
      election: true,
      delegate: true,
    },
  });

  if (!candidate || candidate.electionId !== Number(electionId)) {
    res.status(204).end();
    return;
  }

  const py = await prisma.programYear.findUnique({ where: { id: candidate.election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Soft delete by setting status to withdrawn
  const updated = await prisma.electionCandidate.update({
    where: { id: Number(candidateId) },
    data: { status: 'withdrawn' },
  });

  logger.info(py.programId, `Candidate ${candidate.delegate.firstName} ${candidate.delegate.lastName} withdrawn from election ${electionId} by ${caller.email}`);
  res.json(updated);
});

// ============================================================
// VOTING
// ============================================================

router.post('/elections/:id/vote', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const election = await prisma.election.findUnique({ where: { id: Number(id) } });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Check if election is active
  if (election.status !== 'active') {
    res.status(400).json({ error: 'Election is not currently active' });
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

  // Verify candidate is in this election
  const candidate = await prisma.electionCandidate.findFirst({
    where: {
      electionId: election.id,
      delegateId: candidateId,
      status: { in: ['qualified', 'nominated'] },
    },
  });
  if (!candidate) {
    res.status(400).json({ error: 'Invalid candidate for this election' });
    return;
  }

  const vote = await prisma.electionVote.create({
    data: {
      electionId: election.id,
      candidateDelegateId: candidateId,
      voterDelegateId: voterId,
      voteRank: rank,
      createdByIp: (req as any).ip,
    },
  });
  logger.info(py.programId, `Vote ${vote.id} recorded for election ${election.id}`);
  res.status(201).json(vote);
});

router.get('/elections/:id/results', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      candidates: {
        include: {
          delegate: true,
          party: {
            include: { party: true },
          },
        },
      },
    },
  });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
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

  // Merge with candidate info
  const results = votes.map(v => {
    const candidate = election.candidates.find(c => c.delegateId === v.candidateDelegateId);
    return {
      delegateId: v.candidateDelegateId,
      delegate: candidate?.delegate,
      party: candidate?.party,
      voteCount: v._count,
    };
  }).sort((a, b) => b.voteCount - a.voteCount);

  res.json({
    election: {
      id: election.id,
      status: election.status,
      electionType: election.electionType,
    },
    totalVotes: votes.reduce((sum, v) => sum + v._count, 0),
    results,
  });
});

// ============================================================
// HELPER ENDPOINTS
// ============================================================

// Get positions available for elections at a level (only year-active positions)
router.get('/program-years/:id/election-positions', async (req, res) => {
  const { id } = req.params as { id?: string };
  const { groupingTypeId } = req.query as { groupingTypeId?: string };
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

  // Build query for year-active positions
  const positionWhere: any = {
    isElected: true,
    status: 'active',
  };

  // If groupingTypeId specified, filter to positions that have ballots at this level
  if (groupingTypeId) {
    const typeId = parseInt(groupingTypeId);
    positionWhere.OR = [
      { groupingTypeId: typeId, ballotGroupingTypeId: null },
      { ballotGroupingTypeId: typeId },
    ];
  }

  // Get positions that are ACTIVE for this program year (via ProgramYearPosition)
  const activeYearPositions = await prisma.programYearPosition.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
      position: positionWhere,
    },
    include: {
      position: true,
    },
    orderBy: [
      { position: { groupingTypeId: 'asc' } },
      { position: { displayOrder: 'asc' } },
      { position: { name: 'asc' } },
    ],
  });

  // Check which positions already have open elections
  const existingElections = await prisma.election.findMany({
    where: {
      programYearId: py.id,
      status: { not: 'archived' },
    },
    include: {
      position: true,
    },
  });

  const positionsWithStatus = activeYearPositions.map(pyp => {
    const elections = existingElections.filter(e => e.position.positionId === pyp.position.id);
    return {
      ...pyp.position,
      programYearPositionId: pyp.id,
      hasOpenElections: elections.length > 0,
      electionCount: elections.length,
    };
  });

  res.json(positionsWithStatus);
});

// Get delegates eligible for nomination in a specific election
router.get('/elections/:id/eligible-delegates', async (req, res) => {
  const { id } = req.params as { id?: string };
  const { partyId } = req.query as { partyId?: string };
  const caller = (req as any).user as { userId: number };

  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      grouping: true,
      candidates: true,
    },
  });
  if (!election) {
    res.status(204).end();
    return;
  }
  const py = await prisma.programYear.findUnique({ where: { id: election.programYearId } });
  if (!py) {
    res.status(204).end();
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Get delegates in the same grouping (or child groupings)
  // For now, just get delegates in the election's grouping
  const where: any = {
    programYearId: py.id,
    status: 'active',
    groupingId: election.groupingId,
  };

  // Filter by party if specified (for primary elections)
  if (partyId) {
    where.partyId = parseInt(partyId);
  }

  const delegates = await prisma.delegate.findMany({
    where,
    include: {
      party: {
        include: { party: true },
      },
      grouping: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  // Mark which delegates are already candidates
  const existingCandidateIds = new Set(election.candidates.map(c => c.delegateId));
  const delegatesWithStatus = delegates.map(d => ({
    ...d,
    isCandidate: existingCandidateIds.has(d.id),
  }));

  res.json(delegatesWithStatus);
});

export default router;
