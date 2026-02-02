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

  const { groupingTypeId, positionIds, electionType } = req.body as {
    groupingTypeId?: number;
    positionIds?: number[]; // Optional: specific positions to open (otherwise all elected at level)
    electionType?: 'primary' | 'general'; // Optional: filter by election type
  };

  if (!groupingTypeId) {
    res.status(400).json({ error: 'groupingTypeId required' });
    return;
  }

  if (electionType && !['primary', 'general'].includes(electionType)) {
    res.status(400).json({ error: 'electionType must be "primary" or "general"' });
    return;
  }

  // Get the program to access default voting method
  const program = await prisma.program.findUnique({
    where: { id: py.programId },
    select: { defaultVotingMethod: true },
  });

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
  // Use year-specific isElected from ProgramYearPosition, not base Position
  const activeYearPositions = await prisma.programYearPosition.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
      isElected: true, // Year-specific override
      position: {
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

  // Filter by election type if specified
  // - 'primary': Only partisan positions (isNonPartisan is false or null)
  // - 'general': Only non-partisan positions (isNonPartisan is true)
  // Use year-specific isNonPartisan from ProgramYearPosition, with fallback to base Position
  if (electionType === 'primary') {
    filteredPositions = filteredPositions.filter(pyp => {
      const isNonPartisan = pyp.isNonPartisan ?? pyp.position.isNonPartisan;
      return !isNonPartisan;
    });
  } else if (electionType === 'general') {
    filteredPositions = filteredPositions.filter(pyp => {
      const isNonPartisan = pyp.isNonPartisan ?? pyp.position.isNonPartisan;
      return isNonPartisan === true;
    });
  }

  if (filteredPositions.length === 0) {
    const typeDesc = electionType === 'primary' ? 'partisan' : electionType === 'general' ? 'non-partisan' : 'elected';
    res.status(400).json({ error: `No active ${typeDesc} positions found for this level in the current year. Please check position configuration.` });
    return;
  }

  // Get active parties for this program year (needed for primary elections)
  const activeParties = await prisma.programYearParty.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
    },
    include: {
      party: true,
    },
  });

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
      if (position.isNonPartisan) {
        // Non-partisan: create a single general election
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

        const election = await prisma.election.create({
          data: {
            programYearId: py.id,
            positionId: pyPosition.id,
            groupingId: grouping.id,
            electionType: 'general',
            method: position.electionMethod || program?.defaultVotingMethod || 'plurality',
            status: 'nomination',
          },
        });

        createdElections.push({
          ...election,
          positionName: position.name,
          groupingName: grouping.name,
          partyName: null,
        });
      } else {
        // Partisan: create a separate primary election for each party
        for (const pyParty of activeParties) {
          const existing = await prisma.election.findFirst({
            where: {
              programYearId: py.id,
              positionId: pyPosition.id,
              groupingId: grouping.id,
              partyId: pyParty.id,
              status: { not: 'archived' },
            },
          });

          if (existing) {
            errors.push(`Primary election already exists for ${position.name} in ${grouping.name} (${pyParty.party.name})`);
            continue;
          }

          const election = await prisma.election.create({
            data: {
              programYearId: py.id,
              positionId: pyPosition.id,
              groupingId: grouping.id,
              partyId: pyParty.id,
              electionType: 'primary',
              method: position.electionMethod || program?.defaultVotingMethod || 'plurality',
              status: 'nomination',
            },
          });

          createdElections.push({
            ...election,
            positionName: position.name,
            groupingName: grouping.name,
            partyName: pyParty.party.name,
          });
        }
      }
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
      party: {
        include: {
          party: true, // The actual Party (for primary elections)
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

  // Compute eligible voter counts, unique voters who cast votes, and leading candidate for each election
  // This must account for:
  // - programYearId (only count delegates from the same year)
  // - electionType: primary elections only count delegates from the election's party
  // - grouping level: state-level (levelOrder 1) elections count all delegates
  const electionsWithVoterCounts = await Promise.all(
    filtered.map(async (e) => {
      const electionGroupingLevel = e.grouping?.groupingType?.levelOrder || 999;

      const where: any = {
        programYearId: py.id,
        status: 'active',
      };

      // Only filter by groupingId for lower-level elections (city level and below)
      // For state-level elections, all delegates are eligible
      if (electionGroupingLevel > 1) {
        where.groupingId = e.groupingId;
      }

      // For primary elections, only count delegates from the election's party
      if (e.electionType === 'primary' && e.partyId) {
        where.partyId = e.partyId;
      }

      const eligibleCount = await prisma.delegate.count({ where });

      // Count unique voters who have cast votes in this election
      // This is important for RCV where each voter casts multiple vote records (one per rank)
      // Using distinct voterDelegateId gives the actual turnout
      const uniqueVotersResult = await prisma.electionVote.findMany({
        where: { electionId: e.id },
        select: { voterDelegateId: true },
        distinct: ['voterDelegateId'],
      });
      const uniqueVoters = uniqueVotersResult.length;

      // For active/completed elections, get the leading candidate
      let leader: { delegateId: number; name: string; voteCount: number; percentage: number; isRcvResult?: boolean } | null = null;
      let requiresRunoff = false;

      if (['active', 'completed'].includes(e.status || '')) {
        const method = e.method || 'plurality';

        if (method === 'ranked') {
          // For RCV: Calculate actual IRV result to get true leader after vote redistribution
          const rcvResult = await calculateRankedChoiceResult(e);
          if (rcvResult.winner) {
            leader = {
              delegateId: rcvResult.winner.delegateId,
              name: `${rcvResult.winner.delegate?.firstName || ''} ${rcvResult.winner.delegate?.lastName || ''}`.trim(),
              voteCount: rcvResult.winner.voteCount,
              percentage: Math.round(rcvResult.winner.percentage || 0),
              isRcvResult: true,
            };
          } else if (rcvResult.results && rcvResult.results.length > 0) {
            // No winner yet, show current leader from final round
            const topResult = rcvResult.results[0];
            leader = {
              delegateId: topResult.delegateId,
              name: `${topResult.delegate?.firstName || ''} ${topResult.delegate?.lastName || ''}`.trim(),
              voteCount: topResult.voteCount,
              percentage: Math.round(topResult.percentage || 0),
              isRcvResult: true,
            };
          }
        } else {
          // For plurality/majority: Simple vote count
          const voteCounts = await prisma.electionVote.groupBy({
            by: ['candidateDelegateId'],
            where: { electionId: e.id },
            _count: true,
          });

          if (voteCounts.length > 0) {
            const totalVotes = voteCounts.reduce((sum, v) => sum + v._count, 0);
            const sortedVotes = voteCounts.sort((a, b) => b._count - a._count);
            const topCandidate = sortedVotes[0];

            // Find the delegate info from the candidates array
            const candidate = e.candidates?.find((c: any) => c.delegateId === topCandidate.candidateDelegateId);
            if (candidate) {
              leader = {
                delegateId: topCandidate.candidateDelegateId,
                name: `${candidate.delegate?.firstName || ''} ${candidate.delegate?.lastName || ''}`.trim(),
                voteCount: topCandidate._count,
                percentage: totalVotes > 0 ? Math.round((topCandidate._count / totalVotes) * 100) : 0,
              };
            }

            // For majority elections, check if runoff is needed
            if (method === 'majority' && e.status === 'completed' && e.electionType !== 'runoff') {
              const majorityThreshold = Math.floor(totalVotes / 2) + 1;
              if (topCandidate._count < majorityThreshold) {
                requiresRunoff = true;
              }
            }
          }
        }
      }

      return {
        ...e,
        eligibleVoters: eligibleCount,
        uniqueVoters,
        leader,
        requiresRunoff,
      };
    })
  );

  res.json(electionsWithVoterCounts);
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
    // Get year-activated groupings at this level (not base Grouping table)
    const yearGroupings = await prisma.programYearGrouping.findMany({
      where: {
        programYearId: py.id,
        status: 'active',
        grouping: { groupingTypeId: groupingTypeId },
      },
      select: { groupingId: true },
    });
    where.groupingId = { in: yearGroupings.map(g => g.groupingId) };
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

// Start all scheduled elections
router.post('/program-years/:id/elections/start-all', async (req, res) => {
  const { id } = req.params as { id?: string };
  const { skipNoCandidates } = (req.body || {}) as { skipNoCandidates?: boolean };
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

  // Check if any elections still have open nominations
  const nominationCount = await prisma.election.count({
    where: {
      programYearId: py.id,
      status: 'nomination',
    },
  });

  if (nominationCount > 0) {
    res.status(400).json({
      error: `Cannot start elections: ${nominationCount} election${nominationCount !== 1 ? 's' : ''} still have open nominations. Close all nominations first.`,
    });
    return;
  }

  // Get all scheduled elections with position requirements and candidates
  const scheduledElections = await prisma.election.findMany({
    where: {
      programYearId: py.id,
      status: 'scheduled',
    },
    include: {
      position: {
        include: {
          position: true, // Get the Position details with requirements
        },
      },
      grouping: true,
      candidates: {
        include: {
          delegate: true,
        },
      },
      _count: {
        select: { candidates: true },
      },
    },
  });

  if (scheduledElections.length === 0) {
    res.status(400).json({ error: 'No scheduled elections to start' });
    return;
  }

  // Check for candidates with incomplete requirements
  const incompleteRequirements: Array<{
    electionId: number;
    position: string;
    grouping: string;
    candidateName: string;
    missingDeclaration: boolean;
    missingPetition: boolean;
    petitionSignaturesRequired: number | null;
    petitionSignaturesReceived: number | null;
  }> = [];

  for (const election of scheduledElections) {
    const yearPosition = election.position; // ProgramYearPosition
    const position = yearPosition?.position; // Base Position
    if (!position) continue;

    // Use year-specific overrides from ProgramYearPosition, with fallback to base Position
    const requiresDeclaration = yearPosition?.requiresDeclaration ?? position.requiresDeclaration ?? false;
    const requiresPetition = yearPosition?.requiresPetition ?? position.requiresPetition ?? false;
    const petitionSignaturesRequired = yearPosition?.petitionSignatures ?? position.petitionSignatures ?? 0;

    for (const candidate of election.candidates) {
      const missingDeclaration = requiresDeclaration && !candidate.declarationReceived;
      const missingPetition = requiresPetition && !candidate.petitionVerified;

      if (missingDeclaration || missingPetition) {
        incompleteRequirements.push({
          electionId: election.id,
          position: position.name || 'Unknown',
          grouping: election.grouping?.name || 'Unknown',
          candidateName: `${candidate.delegate.firstName} ${candidate.delegate.lastName}`,
          missingDeclaration,
          missingPetition,
          petitionSignaturesRequired: requiresPetition ? petitionSignaturesRequired : null,
          petitionSignaturesReceived: requiresPetition ? candidate.petitionSignatureCount : null,
        });
      }
    }
  }

  // If there are incomplete requirements, return error with details
  if (incompleteRequirements.length > 0) {
    res.status(400).json({
      error: 'Cannot start elections: some candidates have not completed required candidacy forms or petitions.',
      incompleteRequirements,
      incompleteCount: incompleteRequirements.length,
    });
    return;
  }

  // Separate elections with candidates from those without
  const electionsWithCandidates = scheduledElections.filter(e => e._count.candidates > 0);
  const electionsWithoutCandidates = scheduledElections.filter(e => e._count.candidates === 0);

  // Start only elections that have at least one candidate
  const startTime = new Date();
  let startedCount = 0;
  let skippedCount = 0;

  if (electionsWithCandidates.length > 0) {
    const result = await prisma.election.updateMany({
      where: {
        id: { in: electionsWithCandidates.map(e => e.id) },
      },
      data: {
        status: 'active',
        startTime: startTime,
      },
    });
    startedCount = result.count;
  }

  // If skipNoCandidates is true, mark elections without candidates as 'skipped'
  // and set their ProgramYearPosition.isElected = false
  if (skipNoCandidates && electionsWithoutCandidates.length > 0) {
    // Mark elections as skipped
    const skipResult = await prisma.election.updateMany({
      where: {
        id: { in: electionsWithoutCandidates.map(e => e.id) },
      },
      data: {
        status: 'skipped',
        endTime: new Date(),
      },
    });
    skippedCount = skipResult.count;

    // Update ProgramYearPosition.isElected = false for each skipped election
    const positionIds = electionsWithoutCandidates
      .filter(e => e.positionId)
      .map(e => e.positionId as number);

    if (positionIds.length > 0) {
      await prisma.programYearPosition.updateMany({
        where: {
          id: { in: positionIds },
        },
        data: {
          isElected: false,
        },
      });
    }

    logger.info(py.programId, `Started ${startedCount} elections by ${caller.email}, converted ${skippedCount} to appointed (no candidates)`);
  } else {
    logger.info(py.programId, `Started ${startedCount} elections by ${caller.email} (${electionsWithoutCandidates.length} with no candidates left in scheduled status)`);
  }

  res.json({
    started: startedCount,
    skipped: skipNoCandidates ? skippedCount : electionsWithoutCandidates.length,
    skippedToAppointed: skipNoCandidates ? skippedCount : 0,
    message: `Voting started for ${startedCount} election${startedCount !== 1 ? 's' : ''}.${electionsWithoutCandidates.length > 0 ? ` ${electionsWithoutCandidates.length} ${skipNoCandidates ? 'converted to appointed' : 'skipped'} (no candidates).` : ''}`,
  });
});

// Close all active elections for a program year
router.post('/program-years/:id/elections/close-all', async (req, res) => {
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

  // Find all active elections for this program year
  const activeElections = await prisma.election.findMany({
    where: {
      programYearId: py.id,
      status: 'active',
    },
  });

  if (activeElections.length === 0) {
    res.status(400).json({ error: 'No active elections to close' });
    return;
  }

  // Close all active elections
  const endTime = new Date();
  const result = await prisma.election.updateMany({
    where: {
      id: { in: activeElections.map(e => e.id) },
    },
    data: {
      status: 'completed',
      endTime: endTime,
    },
  });

  logger.info(py.programId, `Closed ${result.count} active elections by ${caller.email}`);

  res.json({
    closed: result.count,
    message: `Closed ${result.count} election${result.count !== 1 ? 's' : ''}. Voting has ended.`,
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

// Create runoff election from a majority election that didn't reach majority
router.post('/elections/:id/runoff', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      candidates: {
        include: {
          delegate: true,
          party: true,
        },
      },
      position: {
        include: { position: true },
      },
      grouping: true,
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

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Check if there are any active elections - runoffs cannot be started until all voting is complete
  const activeElectionsCount = await prisma.election.count({
    where: {
      programYearId: py.id,
      status: 'active',
    },
  });

  if (activeElectionsCount > 0) {
    res.json({
      success: false,
      error: `Cannot create runoff: ${activeElectionsCount} election${activeElectionsCount !== 1 ? 's are' : ' is'} still active. Close all active elections before creating a runoff.`,
      activeElectionsCount,
    });
    return;
  }

  // Verify this is a majority election
  if (election.method !== 'majority') {
    res.json({ success: false, error: 'Runoff elections are only for majority voting method' });
    return;
  }

  // Verify election is active or completed (has votes)
  if (!['active', 'completed'].includes(election.status || '')) {
    res.json({ success: false, error: 'Election must be active or completed to create a runoff' });
    return;
  }

  // Get vote counts to determine top 2 candidates
  const votes = await prisma.electionVote.groupBy({
    by: ['candidateDelegateId'],
    where: { electionId: election.id },
    _count: true,
  });

  const totalVotes = votes.reduce((sum, v) => sum + v._count, 0);

  if (totalVotes === 0) {
    res.json({ success: false, error: 'No votes have been cast in this election' });
    return;
  }

  // Sort by vote count and get top 2
  const sortedVotes = votes.sort((a, b) => b._count - a._count);
  const topTwo = sortedVotes.slice(0, 2);

  if (topTwo.length < 2) {
    res.json({ success: false, error: 'Need at least 2 candidates with votes for a runoff' });
    return;
  }

  // Check if there's already a majority winner (no runoff needed)
  const topVotes = topTwo[0]._count;
  const majorityThreshold = Math.floor(totalVotes / 2) + 1;
  if (topVotes >= majorityThreshold) {
    res.json({ success: false, error: 'A candidate already has a majority. No runoff needed.' });
    return;
  }

  // Determine the runoff type based on parent election type
  const runoffType = election.electionType === 'primary' ? 'primary_runoff' : 'runoff';

  // Check if a runoff already exists for this election
  const existingRunoff = await prisma.election.findFirst({
    where: {
      programYearId: py.id,
      positionId: election.positionId,
      groupingId: election.groupingId,
      partyId: election.partyId,
      electionType: runoffType,
      status: { not: 'archived' },
    },
  });

  if (existingRunoff) {
    res.json({ success: false, error: 'A runoff election already exists for this race' });
    return;
  }

  // Create the runoff election
  const runoffElection = await prisma.election.create({
    data: {
      programYearId: py.id,
      positionId: election.positionId,
      groupingId: election.groupingId,
      partyId: election.partyId,
      electionType: runoffType,
      method: 'plurality', // Runoffs use simple plurality (most votes wins)
      status: 'scheduled',
    },
  });

  // Add only the top 2 candidates to the runoff, preserving their declaration/petition status
  const runoffCandidates = [];
  for (const vote of topTwo) {
    const originalCandidate = election.candidates.find(c => c.delegateId === vote.candidateDelegateId);
    if (originalCandidate) {
      const candidate = await prisma.electionCandidate.create({
        data: {
          electionId: runoffElection.id,
          delegateId: originalCandidate.delegateId,
          partyId: originalCandidate.partyId,
          status: 'qualified', // Auto-qualified for runoff
          // Preserve declaration and petition status from original election
          declarationReceived: originalCandidate.declarationReceived,
          declarationReceivedAt: originalCandidate.declarationReceivedAt,
          petitionVerified: originalCandidate.petitionVerified,
          petitionVerifiedAt: originalCandidate.petitionVerifiedAt,
          petitionSignatureCount: originalCandidate.petitionSignatureCount,
        },
        include: {
          delegate: true,
          party: { include: { party: true } },
        },
      });
      runoffCandidates.push(candidate);
    }
  }

  // Mark original election as completed
  await prisma.election.update({
    where: { id: election.id },
    data: { status: 'completed' },
  });

  logger.info(py.programId, `Runoff election ${runoffElection.id} created from election ${election.id} by ${caller.email}`);

  res.status(201).json({
    success: true,
    runoffElection: {
      ...runoffElection,
      candidates: runoffCandidates,
    },
    originalElectionId: election.id,
    message: `Runoff election created with ${runoffCandidates.length} candidates`,
  });
});

// Reopen nominations for an election
router.post('/elections/:id/reopen-nominations', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      position: {
        include: { position: true },
      },
      grouping: true,
      _count: {
        select: { votes: true },
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

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Only allow reopening from scheduled, active, or completed status
  if (!['scheduled', 'active', 'completed'].includes(election.status || '')) {
    res.json({ success: false, error: 'Election must be scheduled, active, or completed to reopen nominations' });
    return;
  }

  // If there are votes cast, warn but allow (votes will be preserved)
  const voteCount = election._count?.votes || 0;

  // Update election status back to nomination
  const updated = await prisma.election.update({
    where: { id: Number(id) },
    data: {
      status: 'nomination',
      startTime: null,
      endTime: null,
    },
  });

  const positionName = election.position?.position?.name || 'Unknown';
  const groupingName = election.grouping?.name || 'Unknown';

  logger.info(py.programId, `Election ${election.id} (${positionName} - ${groupingName}) reopened for nominations by ${caller.email}${voteCount > 0 ? ` (${voteCount} votes preserved)` : ''}`);

  res.json({
    success: true,
    election: updated,
    message: `Nominations reopened for ${positionName} - ${groupingName}${voteCount > 0 ? `. Note: ${voteCount} existing votes were preserved.` : ''}`,
    votesPreserved: voteCount,
  });
});

// Skip election and convert position to appointed for this year
router.post('/elections/:id/skip-to-appointed', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      position: {
        include: { position: true },
      },
      grouping: true,
      _count: {
        select: { candidates: true, votes: true },
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

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Only allow skipping elections that have no candidates or are in nomination/scheduled status
  const candidateCount = election._count?.candidates || 0;
  const voteCount = election._count?.votes || 0;

  if (candidateCount > 0 && voteCount > 0) {
    res.json({
      success: false,
      error: 'Cannot skip election that has candidates with votes. Use Close Election instead.',
    });
    return;
  }

  // Update election status to 'skipped' (a new status indicating position will be appointed)
  // The 'skipped' status indicates this election was abandoned and the position
  // will need to be filled via appointment rather than election
  const updated = await prisma.election.update({
    where: { id: Number(id) },
    data: {
      status: 'skipped',
      endTime: new Date(),
    },
  });

  // Mark the ProgramYearPosition as not elected (will be appointed instead)
  if (election.positionId) {
    await prisma.programYearPosition.update({
      where: { id: election.positionId },
      data: {
        isElected: false,
      },
    });
  }

  const positionName = election.position?.position?.name || 'Unknown';
  const groupingName = election.grouping?.name || 'Unknown';

  logger.info(py.programId, `Election ${election.id} (${positionName} - ${groupingName}) skipped - position converted to appointed by ${caller.email}`);

  res.json({
    success: true,
    election: updated,
    message: `${positionName} - ${groupingName} has been converted to an appointed position for this year.`,
    appointedPosition: true,
  });
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

  // For primary elections, verify delegate belongs to this election's party
  if (election.electionType === 'primary' && election.partyId) {
    if (!delegate.partyId) {
      res.status(400).json({ error: 'Delegate has no party assigned' });
      return;
    }
    if (delegate.partyId !== election.partyId) {
      res.status(400).json({ error: 'Delegate does not belong to this primary\'s party' });
      return;
    }
  }

  // Determine party to use for the candidate record
  const candidatePartyId = partyId || delegate.partyId;

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

  const candidate = await prisma.electionCandidate.create({
    data: {
      electionId: election.id,
      delegateId,
      partyId: candidatePartyId,
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
// Status is automatically computed:
// - 'withdrawn' if explicitly set by admin
// - 'qualified' if all position requirements are met
// - 'nominated' otherwise
router.put('/elections/:electionId/candidates/:candidateId', async (req, res) => {
  const { electionId, candidateId } = req.params as { electionId?: string; candidateId?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const candidate = await prisma.electionCandidate.findUnique({
    where: { id: Number(candidateId) },
    include: {
      election: {
        include: {
          position: {
            include: {
              position: true,
            },
          },
        },
      },
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

  // Update requirement fields
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

  // Compute final values for status calculation
  const finalDeclarationReceived = declarationReceived !== undefined ? declarationReceived : candidate.declarationReceived;
  const finalPetitionVerified = petitionVerified !== undefined ? petitionVerified : candidate.petitionVerified;

  // Get position requirements
  const position = candidate.election.position?.position;
  const requiresDeclaration = position?.requiresDeclaration || false;
  const requiresPetition = position?.requiresPetition || false;

  // Compute status automatically
  // If explicitly set to 'withdrawn', honor that
  // Otherwise, compute based on requirements
  if (status === 'withdrawn') {
    updateData.status = 'withdrawn';
  } else {
    // Check if all requirements are met
    const declarationMet = !requiresDeclaration || finalDeclarationReceived;
    const petitionMet = !requiresPetition || finalPetitionVerified;

    if (declarationMet && petitionMet) {
      updateData.status = 'qualified';
    } else {
      updateData.status = 'nominated';
    }
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

  // ============================================================
  // VOTER ELIGIBILITY VALIDATION
  // ============================================================

  // Fetch voter delegate to check eligibility
  const voter = await prisma.delegate.findUnique({
    where: { id: voterId },
  });
  if (!voter) {
    res.status(400).json({ error: 'Invalid voter' });
    return;
  }

  // Verify voter is in the same program year
  if (voter.programYearId !== election.programYearId) {
    res.status(403).json({ error: 'Voter is not in this program year' });
    return;
  }

  // Verify voter is active
  if (voter.status !== 'active') {
    res.status(403).json({ error: 'Voter is not active' });
    return;
  }

  // Fetch election with grouping info for eligibility checks
  const electionWithDetails = await prisma.election.findUnique({
    where: { id: election.id },
    include: {
      grouping: {
        include: { groupingType: true },
      },
    },
  });

  // Check grouping eligibility for lower-level elections
  if (electionWithDetails?.grouping) {
    const groupingLevel = electionWithDetails.grouping.groupingType?.levelOrder || 999;

    // For non-state level elections (level > 1), voter must be in the election's grouping
    if (groupingLevel > 1 && voter.groupingId !== electionWithDetails.groupingId) {
      res.status(403).json({ error: 'You are not eligible to vote in this election (wrong grouping)' });
      return;
    }
  }

  // Check party eligibility for primary elections (closed primary model - default)
  if (election.electionType === 'primary' && election.partyId) {
    // Closed primary: voter must be a member of the election's party
    if (voter.partyId !== election.partyId) {
      res.status(403).json({ error: 'You are not eligible to vote in this primary (not a party member)' });
      return;
    }
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

  // Auto-close election if 100% turnout is reached
  // Only check for first-choice votes (rank 1 or null for non-RCV)
  if (rank === 1 || rank === undefined || rank === null) {
    const electionWithGrouping = await prisma.election.findUnique({
      where: { id: election.id },
      include: {
        grouping: {
          include: { groupingType: true },
        },
      },
    });

    if (electionWithGrouping) {
      const electionGroupingLevel = electionWithGrouping.grouping?.groupingType?.levelOrder || 999;

      // Build where clause for eligible voters
      const eligibleWhere: any = {
        programYearId: py.id,
        status: 'active',
      };

      // Only filter by groupingId for lower-level elections
      if (electionGroupingLevel > 1) {
        eligibleWhere.groupingId = electionWithGrouping.groupingId;
      }

      // For primary elections, only count delegates from the election's party
      if (electionWithGrouping.electionType === 'primary' && electionWithGrouping.partyId) {
        eligibleWhere.partyId = electionWithGrouping.partyId;
      }

      const eligibleCount = await prisma.delegate.count({ where: eligibleWhere });

      // Count unique voters who have cast votes
      const uniqueVotersResult = await prisma.electionVote.findMany({
        where: { electionId: election.id },
        select: { voterDelegateId: true },
        distinct: ['voterDelegateId'],
      });
      const uniqueVoters = uniqueVotersResult.length;

      // Auto-close if all eligible voters have voted
      if (eligibleCount > 0 && uniqueVoters >= eligibleCount) {
        await prisma.election.update({
          where: { id: election.id },
          data: {
            status: 'completed',
            endTime: new Date(),
          },
        });
        logger.info(py.programId, `Election ${election.id} auto-closed: 100% turnout (${uniqueVoters}/${eligibleCount})`);
      }
    }
  }

  res.status(201).json(vote);
});

// Get list of voters who have voted in an election
router.get('/elections/:id/voters', async (req, res) => {
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

  // Get all voter delegate IDs for this election
  const votes = await prisma.electionVote.findMany({
    where: { electionId: election.id },
    select: { voterDelegateId: true },
    distinct: ['voterDelegateId'],
  });

  const voterIds = votes.map(v => v.voterDelegateId);

  res.json({
    electionId: election.id,
    voterCount: voterIds.length,
    voterIds,
  });
});

// Get full vote audit for an election (admin only - for testing)
router.get('/elections/:id/audit', async (req, res) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      position: {
        include: { position: true },
      },
      grouping: true,
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
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden - admin access required for audit' });
    return;
  }

  // Get all votes
  const votes = await prisma.electionVote.findMany({
    where: { electionId: election.id },
    orderBy: { createdAt: 'asc' },
  });

  // Get all unique delegate IDs (voters and candidates)
  const voterIds = [...new Set(votes.map(v => v.voterDelegateId))];
  const candidateIds = [...new Set(votes.map(v => v.candidateDelegateId))];
  const allDelegateIds = [...new Set([...voterIds, ...candidateIds])];

  // Fetch all delegates in one query
  const delegates = await prisma.delegate.findMany({
    where: { id: { in: allDelegateIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const delegateMap = new Map(delegates.map(d => [d.id, d]));

  // Get candidate party information
  const candidates = await prisma.electionCandidate.findMany({
    where: { electionId: election.id },
    include: {
      party: { include: { party: true } },
    },
  });
  const candidatePartyMap = new Map(
    candidates.map(c => [c.delegateId, c.party?.party?.name || 'Independent'])
  );

  const auditRecords = votes.map(v => {
    const voter = delegateMap.get(v.voterDelegateId);
    const candidate = delegateMap.get(v.candidateDelegateId);
    return {
      voteId: v.id,
      voter: {
        id: v.voterDelegateId,
        name: voter ? `${voter.firstName} ${voter.lastName}` : 'Unknown',
      },
      candidate: {
        id: v.candidateDelegateId,
        name: candidate ? `${candidate.firstName} ${candidate.lastName}` : 'Unknown',
        party: candidatePartyMap.get(v.candidateDelegateId) || 'Unknown',
      },
      rank: v.voteRank,  // Include rank for RCV debugging
      timestamp: v.createdAt,
      ip: v.createdByIp,
    };
  });

  res.json({
    election: {
      id: election.id,
      position: election.position?.position?.name || 'Unknown',
      grouping: election.grouping?.name || 'Unknown',
      status: election.status,
      electionType: election.electionType,
      method: election.method,  // Include method for debugging
    },
    totalVotes: votes.length,
    votes: auditRecords,
  });
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

  const method = election.method || 'plurality';

  // For ranked choice, we need all individual votes with ranks
  if (method === 'ranked') {
    const rankedResult = await calculateRankedChoiceResult(election);
    res.json(rankedResult);
    return;
  }

  // For plurality and majority, we use vote counts
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

  const totalVotes = votes.reduce((sum, v) => sum + v._count, 0);

  // Determine winner based on method
  let winner = null;
  let requiresRunoff = false;
  let winnerPercentage = 0;

  if (results.length > 0 && totalVotes > 0) {
    const topCandidate = results[0];
    winnerPercentage = (topCandidate.voteCount / totalVotes) * 100;

    if (method === 'majority') {
      // Majority requires > 50%
      if (winnerPercentage > 50) {
        winner = {
          delegateId: topCandidate.delegateId,
          delegate: topCandidate.delegate,
          party: topCandidate.party,
          voteCount: topCandidate.voteCount,
          percentage: winnerPercentage,
        };
      } else {
        // Need a runoff between top 2 candidates
        requiresRunoff = true;
      }
    } else {
      // Plurality - most votes wins
      winner = {
        delegateId: topCandidate.delegateId,
        delegate: topCandidate.delegate,
        party: topCandidate.party,
        voteCount: topCandidate.voteCount,
        percentage: winnerPercentage,
      };
    }
  }

  res.json({
    election: {
      id: election.id,
      status: election.status,
      electionType: election.electionType,
      method,
    },
    totalVotes,
    results,
    winner,
    requiresRunoff,
    runoffCandidates: requiresRunoff ? results.slice(0, 2) : null,
  });
});

// Helper function for ranked choice (instant runoff) voting
async function calculateRankedChoiceResult(election: any) {
  // Get all votes with their ranks
  const allVotes = await prisma.electionVote.findMany({
    where: { electionId: election.id },
    orderBy: [{ voterDelegateId: 'asc' }, { voteRank: 'asc' }],
  });

  // Debug: Log vote ranks distribution
  const rankDistribution: { [key: number]: number } = {};
  const nullRanks = allVotes.filter(v => v.voteRank === null).length;
  allVotes.forEach(v => {
    if (v.voteRank != null) {
      rankDistribution[v.voteRank] = (rankDistribution[v.voteRank] || 0) + 1;
    }
  });
  logger.info('debug', `RCV Debug: Total votes=${allVotes.length}, null ranks=${nullRanks}, rank distribution=${JSON.stringify(rankDistribution)}`);

  // Group votes by voter - each voter may have multiple ranked votes
  const votesByVoter = new Map<number, { candidateId: number; rank: number }[]>();
  for (const vote of allVotes) {
    if (!votesByVoter.has(vote.voterDelegateId)) {
      votesByVoter.set(vote.voterDelegateId, []);
    }
    votesByVoter.get(vote.voterDelegateId)!.push({
      candidateId: vote.candidateDelegateId,
      rank: vote.voteRank || 1,
    });
  }

  // Debug: Log how many voters and how many choices per voter
  const votersWithMultipleChoices = Array.from(votesByVoter.values()).filter(v => v.length > 1).length;
  const maxChoices = Math.max(...Array.from(votesByVoter.values()).map(v => v.length));
  logger.info('debug', `RCV Debug: Unique voters=${votesByVoter.size}, voters with multiple choices=${votersWithMultipleChoices}, max choices=${maxChoices}`);

  // Sort each voter's choices by rank
  for (const [, votes] of votesByVoter) {
    votes.sort((a, b) => a.rank - b.rank);
  }

  const totalVoters = votesByVoter.size;
  const majorityThreshold = Math.floor(totalVoters / 2) + 1;

  // Track eliminated candidates
  const eliminatedCandidates = new Set<number>();
  const rounds: any[] = [];

  // Get all candidate IDs
  const candidateIds = new Set<number>(election.candidates.map((c: any) => c.delegateId as number));

  while (true) {
    // Count first-choice votes (from remaining non-eliminated candidates)
    const voteCounts = new Map<number, number>();
    for (const candidateId of candidateIds) {
      if (!eliminatedCandidates.has(candidateId)) {
        voteCounts.set(candidateId, 0);
      }
    }

    for (const [, voterChoices] of votesByVoter) {
      // Find this voter's highest-ranked choice that isn't eliminated
      const validChoice = voterChoices.find(c => !eliminatedCandidates.has(c.candidateId));
      if (validChoice) {
        voteCounts.set(validChoice.candidateId, (voteCounts.get(validChoice.candidateId) || 0) + 1);
      }
    }

    // Record this round
    const roundResults = Array.from(voteCounts.entries())
      .map(([candidateId, count]) => {
        const candidate = election.candidates.find((c: any) => c.delegateId === candidateId);
        return {
          delegateId: candidateId,
          delegate: candidate?.delegate,
          party: candidate?.party,
          voteCount: count,
          percentage: totalVoters > 0 ? (count / totalVoters) * 100 : 0,
        };
      })
      .sort((a, b) => b.voteCount - a.voteCount);

    rounds.push({
      roundNumber: rounds.length + 1,
      results: roundResults,
      eliminated: null,
    });

    // Check if we have a winner (majority)
    if (roundResults.length > 0 && roundResults[0].voteCount >= majorityThreshold) {
      return {
        election: {
          id: election.id,
          status: election.status,
          electionType: election.electionType,
          method: 'ranked',
        },
        totalVotes: totalVoters, // Use totalVoters as totalVotes for consistency with non-RCV results
        totalVoters,
        majorityThreshold,
        rounds,
        winner: roundResults[0],
        requiresRunoff: false,
        results: roundResults,
      };
    }

    // Check if only one candidate remains
    if (roundResults.length <= 1) {
      return {
        election: {
          id: election.id,
          status: election.status,
          electionType: election.electionType,
          method: 'ranked',
        },
        totalVotes: totalVoters,
        totalVoters,
        majorityThreshold,
        rounds,
        winner: roundResults[0] || null,
        requiresRunoff: false,
        results: roundResults,
      };
    }

    // Check if we have a tie at the bottom
    const lastPlace = roundResults[roundResults.length - 1];
    const tiedForLast = roundResults.filter(r => r.voteCount === lastPlace.voteCount);

    if (tiedForLast.length === roundResults.length) {
      // Everyone is tied - no winner can be determined
      return {
        election: {
          id: election.id,
          status: election.status,
          electionType: election.electionType,
          method: 'ranked',
        },
        totalVotes: totalVoters,
        totalVoters,
        majorityThreshold,
        rounds,
        winner: null,
        requiresRunoff: true,
        tieBreakNeeded: true,
        results: roundResults,
      };
    }

    // Eliminate the candidate with the fewest votes
    // If there's a tie for last, eliminate all of them (standard IRV rule)
    const eliminatedNames = tiedForLast.map(c => `${c.delegate?.firstName} ${c.delegate?.lastName} (${c.voteCount})`).join(', ');
    logger.info('debug', `RCV Debug Round ${rounds.length}: Eliminating ${eliminatedNames}`);

    for (const candidate of tiedForLast) {
      eliminatedCandidates.add(candidate.delegateId);
      rounds[rounds.length - 1].eliminated = tiedForLast.map(c => ({
        delegateId: c.delegateId,
        delegate: c.delegate,
      }));
    }

    // Debug: Count how many votes will redistribute to each candidate
    const redistributionPreview: { [key: string]: number } = {};
    for (const [, voterChoices] of votesByVoter) {
      const currentChoice = voterChoices.find(c => !eliminatedCandidates.has(c.candidateId));
      const previousChoice = voterChoices.find(c => tiedForLast.some(t => t.delegateId === c.candidateId));
      if (previousChoice && currentChoice && previousChoice !== currentChoice) {
        // This voter's vote is being redistributed
        const toCandidate = election.candidates.find((ec: any) => ec.delegateId === currentChoice.candidateId);
        const key = toCandidate ? `${toCandidate.delegate?.firstName} ${toCandidate.delegate?.lastName}` : `ID:${currentChoice.candidateId}`;
        redistributionPreview[key] = (redistributionPreview[key] || 0) + 1;
      }
    }
    logger.info('debug', `RCV Debug: Vote redistribution preview: ${JSON.stringify(redistributionPreview)}`);
  }
}

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
  const caller = (req as any).user as { userId: number };

  const election = await prisma.election.findUnique({
    where: { id: Number(id) },
    include: {
      grouping: {
        include: { groupingType: true },
      },
      party: {
        include: { party: true },
      },
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

  // Get delegates eligible for this election based on grouping level
  // - State level (levelOrder 1): All active delegates in the program year can run
  // - County level (levelOrder 2): Delegates in cities under that county (TODO: implement parent-child)
  // - City level (levelOrder 3+): Only delegates in that specific city
  const electionGroupingLevel = election.grouping?.groupingType?.levelOrder || 999;

  const where: any = {
    programYearId: py.id,
    status: 'active',
  };

  // Only filter by groupingId for lower-level elections (city level and below)
  // For state-level elections, all delegates are eligible
  if (electionGroupingLevel > 1) {
    where.groupingId = election.groupingId;
  }

  // For primary elections, only show delegates from the election's party
  if (election.electionType === 'primary' && election.partyId) {
    where.partyId = election.partyId;
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

  // Get all candidates across ALL active elections (not just this one)
  // A delegate can only run in one election at a time
  // Include position name so we can show "Nominated for <Office>"
  const allActiveCandidates = await prisma.electionCandidate.findMany({
    where: {
      election: {
        programYearId: py.id,
        status: { notIn: ['archived', 'completed'] },
      },
    },
    select: {
      delegateId: true,
      election: {
        select: {
          position: {
            select: {
              position: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });
  // Map delegateId -> position name they're nominated for
  const candidatePositionMap = new Map<number, string>();
  for (const c of allActiveCandidates) {
    const positionName = c.election?.position?.position?.name || 'another position';
    candidatePositionMap.set(c.delegateId, positionName);
  }

  const delegatesWithStatus = delegates.map(d => ({
    ...d,
    isCandidate: candidatePositionMap.has(d.id),
    nominatedFor: candidatePositionMap.get(d.id) || null,
  }));

  res.json(delegatesWithStatus);
});

export default router;
