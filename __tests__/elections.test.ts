import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.election.create.mockReset();
  mockedPrisma.election.findMany.mockReset();
  mockedPrisma.election.findUnique.mockReset();
  mockedPrisma.election.update.mockReset();
  mockedPrisma.electionVote.create.mockReset();
  mockedPrisma.electionVote.groupBy.mockReset();
  mockedPrisma.electionVote.findMany.mockReset();
  mockedPrisma.delegate.count.mockReset();
  mockedPrisma.delegate.findUnique.mockReset();
  mockedPrisma.electionCandidate.findFirst.mockReset();
  mockedPrisma.programYearGrouping.findMany.mockReset();
});

describe('Election endpoints', () => {
  it('creates election when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1, groupingId: 2, method: 'fptp' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.election.create).toHaveBeenCalled();
  });

  it('lists elections for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'nomination',
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [],
    }]);
    // Mock for eligible voter count calculation
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    // Mock for unique voters calculation
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('records vote and returns results', async () => {
    mockedPrisma.election.findUnique.mockResolvedValue({
      id: 1,
      programYearId: 1,
      status: 'active',
      candidates: [],
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 3 } },
      groupingId: 1,
      electionType: 'general',
      partyId: null,
    });
    mockedPrisma.programYear.findUnique.mockResolvedValue({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValue({ role: 'delegate' });
    // Mock for candidate validation in vote endpoint
    mockedPrisma.electionCandidate.findFirst.mockResolvedValue({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Mock for voter eligibility validation
    mockedPrisma.delegate.findUnique.mockResolvedValue({ id: 3, programYearId: 1, status: 'active', groupingId: 1, partyId: null });
    mockedPrisma.electionVote.create.mockResolvedValue({ id: 10 });
    // Mocks for auto-close logic
    mockedPrisma.delegate.count.mockResolvedValue(10);
    mockedPrisma.electionVote.findMany.mockResolvedValue([{ voterDelegateId: 3 }]);
    const voteRes = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(voteRes.status).toBe(201);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([{ candidateDelegateId: 2, _count: 1 }]);
    const results = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(results.status).toBe(200);
    expect(mockedPrisma.electionVote.groupBy).toHaveBeenCalled();
  });
});

describe('POST /program-years/:id/elections validation', () => {
  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1, groupingId: 2, method: 'fptp' });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1, groupingId: 2, method: 'fptp' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('positionId and groupingId required');
  });

  it('creates election with optional times', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({
        positionId: 1,
        groupingId: 2,
        method: 'fptp',
        startTime: '2025-06-01T10:00:00Z',
        endTime: '2025-06-01T12:00:00Z',
      });
    expect(res.status).toBe(201);
  });
});

describe('GET /program-years/:id/elections validation', () => {
  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /elections/:id validation', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(403);
  });

  it('updates election with times', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'active' });
    const res = await request(app)
      .put('/elections/1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        status: 'active',
        startTime: '2025-06-01T10:00:00Z',
        endTime: '2025-06-01T12:00:00Z',
      });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /elections/:id validation', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('archives election when admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'archived' });
    const res = await request(app)
      .delete('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.election.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'archived' },
    });
  });
});

describe('POST /elections/:id/vote validation', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/999/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1, voterId: 2 });
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1, voterId: 2 });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1, voterId: 2 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('candidateId and voterId required');
  });

  it('records vote with optional rank', async () => {
    mockedPrisma.election.findUnique.mockResolvedValue({ id: 1, programYearId: 1, status: 'active', electionType: 'general', partyId: null, groupingId: null });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Mock for voter eligibility validation
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'active', groupingId: 1, partyId: null });
    mockedPrisma.electionVote.create.mockResolvedValueOnce({ id: 10 });
    // Mocks for auto-close logic
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([{ voterDelegateId: 3 }]);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3, rank: 1 });
    expect(res.status).toBe(201);
  });
});

// ============================================================
// VOTER ELIGIBILITY VALIDATION TESTS
// ============================================================

describe('POST /elections/:id/vote - voter eligibility', () => {
  beforeEach(() => {
    mockedPrisma.delegate.findUnique.mockReset();
  });

  it('returns 400 when voter not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid voter');
  });

  it('returns 403 when voter is in different program year', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 999, status: 'active' });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Voter is not in this program year');
  });

  it('returns 403 when voter is not active', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'pending_assignment' });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Voter is not active');
  });

  it('returns 403 when voter is in wrong grouping for lower-level election', async () => {
    // First call returns basic election, second call returns with grouping details
    mockedPrisma.election.findUnique
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 5, electionType: 'general', partyId: null })
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 5, grouping: { id: 5, groupingType: { id: 1, levelOrder: 3 } } });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Voter is in grouping 10, but election is for grouping 5
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'active', groupingId: 10, partyId: null });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not eligible to vote in this election (wrong grouping)');
  });

  it('allows voting in state-level election regardless of grouping', async () => {
    // State-level election (levelOrder = 1)
    mockedPrisma.election.findUnique
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, electionType: 'general', partyId: null })
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } } });
    mockedPrisma.programYear.findUnique.mockResolvedValue({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Voter is in different grouping (10) but election is state-level (should be allowed)
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'active', groupingId: 10, partyId: null });
    mockedPrisma.electionVote.create.mockResolvedValueOnce({ id: 10 });
    // Mocks for auto-close logic
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([{ voterDelegateId: 3 }]);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(201);
  });

  it('returns 403 when non-party member votes in primary election', async () => {
    // Primary election for party 1
    mockedPrisma.election.findUnique
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, electionType: 'primary', partyId: 1 })
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } } });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Voter is in party 2, but primary is for party 1
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'active', groupingId: 1, partyId: 2 });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not eligible to vote in this primary (not a party member)');
  });

  it('allows party member to vote in their party primary', async () => {
    // Primary election for party 1
    mockedPrisma.election.findUnique
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, electionType: 'primary', partyId: 1 })
      .mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active', groupingId: 1, grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } } });
    mockedPrisma.programYear.findUnique.mockResolvedValue({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce({ id: 1, electionId: 1, delegateId: 2, status: 'qualified' });
    // Voter is in party 1 (matches the primary's party)
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 3, programYearId: 1, status: 'active', groupingId: 1, partyId: 1 });
    mockedPrisma.electionVote.create.mockResolvedValueOnce({ id: 10 });
    // Mocks for auto-close logic
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([{ voterDelegateId: 3 }]);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(201);
  });
});

describe('GET /elections/:id/results validation', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// OPEN-LEVEL BATCH ELECTION CREATION
// ============================================================

describe('POST /program-years/:id/elections/open-level', () => {
  beforeEach(() => {
    mockedPrisma.program.findUnique.mockReset();
    mockedPrisma.groupingType.findUnique.mockReset();
    mockedPrisma.programYearGrouping.findMany.mockReset();
    mockedPrisma.programYearPosition.findMany.mockReset();
    mockedPrisma.programYearParty.findMany.mockReset();
    mockedPrisma.election.findFirst.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when groupingTypeId missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('groupingTypeId required');
  });

  it('returns 400 for invalid electionType', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, electionType: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('electionType must be "primary" or "general"');
  });

  it('returns 400 when grouping type not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid grouping type');
  });

  it('returns 400 when no active groupings found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', defaultName: 'City' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No active groupings found');
  });

  it('returns 400 when no active positions found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', defaultName: 'City' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { grouping: { id: 1, name: 'Town A' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No active elected positions found');
  });

  it('creates elections for non-partisan positions', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', defaultName: 'City' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { grouping: { id: 1, name: 'Town A' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', isNonPartisan: true, electionMethod: 'plurality' } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.election.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.election.create.mockResolvedValueOnce({ id: 1 });

    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, electionType: 'general' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
  });

  it('creates primary elections for partisan positions', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', defaultName: 'City' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { grouping: { id: 1, name: 'Town A' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Governor', isNonPartisan: false, electionMethod: 'plurality' } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, party: { id: 1, name: 'Federalist' } },
      { id: 2, party: { id: 2, name: 'Nationalist' } },
    ]);
    mockedPrisma.election.findFirst.mockResolvedValue(null);
    mockedPrisma.election.create.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, electionType: 'primary' });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2); // One election per party
  });
});

// ============================================================
// CLOSE NOMINATIONS BATCH OPERATION
// ============================================================

describe('POST /program-years/:id/elections/close-nominations', () => {
  beforeEach(() => {
    mockedPrisma.grouping.findMany.mockReset();
    mockedPrisma.election.updateMany.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/elections/close-nominations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections/close-nominations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('closes nominations by electionIds', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.updateMany.mockResolvedValueOnce({ count: 3 });
    const res = await request(app)
      .post('/program-years/1/elections/close-nominations')
      .set('Authorization', `Bearer ${token}`)
      .send({ electionIds: [1, 2, 3] });
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(3);
  });

  it('closes nominations by groupingTypeId', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    // Mock year-activated groupings at this level
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ groupingId: 1 }, { groupingId: 2 }]);
    mockedPrisma.election.updateMany.mockResolvedValueOnce({ count: 5 });
    const res = await request(app)
      .post('/program-years/1/elections/close-nominations')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(5);
    expect(res.body.message).toContain('5 elections');
  });
});

// ============================================================
// START-ALL ELECTIONS
// ============================================================

describe('POST /program-years/:id/elections/start-all', () => {
  beforeEach(() => {
    mockedPrisma.election.count.mockReset();
    mockedPrisma.election.updateMany.mockReset();
    mockedPrisma.programYearPosition.updateMany.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when nominations still open', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(3); // 3 elections in nomination status
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('still have open nominations');
  });

  it('returns 400 when no scheduled elections', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0); // No nominations
    mockedPrisma.election.findMany.mockResolvedValueOnce([]); // No scheduled elections
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No scheduled elections to start');
  });

  it('returns 400 when candidates have incomplete requirements', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.election.findMany.mockResolvedValueOnce([
      {
        id: 1,
        positionId: 1,
        status: 'scheduled',
        position: { position: { name: 'Mayor', requiresDeclaration: true, requiresPetition: false } },
        grouping: { name: 'Town A' },
        candidates: [
          { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' }, declarationReceived: false, petitionVerified: false, petitionSignatureCount: 0 },
        ],
        _count: { candidates: 1 },
      },
    ]);
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('candidates have not completed required');
    expect(res.body.incompleteCount).toBe(1);
  });

  it('starts elections with candidates successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.election.findMany.mockResolvedValueOnce([
      {
        id: 1,
        positionId: 1,
        status: 'scheduled',
        position: { position: { name: 'Mayor', requiresDeclaration: false, requiresPetition: false } },
        grouping: { name: 'Town A' },
        candidates: [
          { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' }, declarationReceived: true, petitionVerified: true },
        ],
        _count: { candidates: 1 },
      },
      {
        id: 2,
        positionId: 2,
        status: 'scheduled',
        position: { position: { name: 'Sheriff', requiresDeclaration: false, requiresPetition: false } },
        grouping: { name: 'Town A' },
        candidates: [],
        _count: { candidates: 0 },
      },
    ]);
    mockedPrisma.election.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.started).toBe(1);
    expect(res.body.skipped).toBe(1); // Election without candidates
  });

  it('converts elections without candidates to appointed when skipNoCandidates is true', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.election.findMany.mockResolvedValueOnce([
      {
        id: 1,
        positionId: 1,
        status: 'scheduled',
        position: { position: { name: 'Mayor', requiresDeclaration: false, requiresPetition: false } },
        grouping: { name: 'Town A' },
        candidates: [
          { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' }, declarationReceived: true, petitionVerified: true },
        ],
        _count: { candidates: 1 },
      },
      {
        id: 2,
        positionId: 2,
        status: 'scheduled',
        position: { position: { name: 'Sheriff', requiresDeclaration: false, requiresPetition: false } },
        grouping: { name: 'Town A' },
        candidates: [],
        _count: { candidates: 0 },
      },
    ]);
    mockedPrisma.election.updateMany
      .mockResolvedValueOnce({ count: 1 }) // start elections with candidates
      .mockResolvedValueOnce({ count: 1 }); // skip elections without candidates
    mockedPrisma.programYearPosition.updateMany.mockResolvedValueOnce({ count: 1 });
    const res = await request(app)
      .post('/program-years/1/elections/start-all')
      .set('Authorization', `Bearer ${token}`)
      .send({ skipNoCandidates: true });
    expect(res.status).toBe(200);
    expect(res.body.started).toBe(1);
    expect(res.body.skippedToAppointed).toBe(1);
    expect(mockedPrisma.programYearPosition.updateMany).toHaveBeenCalled();
  });
});

// ============================================================
// CLOSE-ALL ELECTIONS
// ============================================================

describe('POST /program-years/:id/elections/close-all', () => {
  beforeEach(() => {
    mockedPrisma.election.updateMany.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/elections/close-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections/close-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when no active elections', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/elections/close-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No active elections to close');
  });

  it('closes all active elections successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    mockedPrisma.election.updateMany.mockResolvedValueOnce({ count: 3 });
    const res = await request(app)
      .post('/program-years/1/elections/close-all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.closed).toBe(3);
    expect(res.body.message).toContain('Closed 3 elections');
  });
});

// ============================================================
// RUNOFF ELECTION CREATION
// ============================================================

describe('POST /elections/:id/runoff', () => {
  beforeEach(() => {
    mockedPrisma.election.count.mockReset();
    mockedPrisma.election.findFirst.mockReset();
    mockedPrisma.electionCandidate.create.mockReset();
  });

  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/999/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with success: false when active elections exist', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(2); // 2 active elections
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('2 elections are still active');
  });

  it('returns 200 with success: false for non-majority elections', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'plurality',
      status: 'completed',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Runoff elections are only for majority voting method');
  });

  it('returns 200 with success: false when election not active or completed', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'nomination',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Election must be active or completed to create a runoff');
  });

  it('returns 200 with success: false when no votes cast', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('No votes have been cast in this election');
  });

  it('returns 200 with success: false when less than 2 candidates have votes', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 10 }, // Only one candidate has votes
    ]);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Need at least 2 candidates with votes for a runoff');
  });

  it('returns 200 with success: false when candidate already has majority', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 60 },
      { candidateDelegateId: 2, _count: 40 },
    ]);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('A candidate already has a majority. No runoff needed.');
  });

  it('returns 200 with success: false when runoff already exists', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      groupingId: 1,
      partyId: null,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1 },
        { delegateId: 2 },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 40 },
      { candidateDelegateId: 2, _count: 35 },
      { candidateDelegateId: 3, _count: 25 },
    ]);
    mockedPrisma.election.findFirst.mockResolvedValueOnce({ id: 2, electionType: 'runoff' });
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('A runoff election already exists for this race');
  });

  it('creates runoff election successfully', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      groupingId: 1,
      partyId: null,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1, partyId: null, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, partyId: null, delegate: { firstName: 'Jane', lastName: 'Smith' } },
        { delegateId: 3, partyId: null, delegate: { firstName: 'Bob', lastName: 'Wilson' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.count.mockResolvedValueOnce(0);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 40 },
      { candidateDelegateId: 2, _count: 35 },
      { candidateDelegateId: 3, _count: 25 },
    ]);
    mockedPrisma.election.findFirst.mockResolvedValueOnce(null); // No existing runoff
    mockedPrisma.election.create.mockResolvedValueOnce({ id: 2, electionType: 'runoff', status: 'scheduled' });
    mockedPrisma.electionCandidate.create
      .mockResolvedValueOnce({ id: 1, delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } })
      .mockResolvedValueOnce({ id: 2, delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'completed' });

    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.runoffElection).toBeDefined();
    expect(res.body.runoffElection.candidates).toHaveLength(2);
  });
});

// ============================================================
// CANDIDATE MANAGEMENT
// ============================================================

describe('POST /elections/:id/candidates', () => {
  beforeEach(() => {
    mockedPrisma.delegate.findUnique.mockReset();
    mockedPrisma.electionCandidate.create.mockReset();
    mockedPrisma.electionCandidate.findFirst.mockReset();
  });

  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/999/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 1 });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'nomination' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when delegateId missing', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'nomination' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('delegateId required');
  });

  it('returns 400 when nominations are closed', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'active' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Election is not accepting nominations');
  });

  it('returns 400 when delegate not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'nomination' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid delegate');
  });

  it('returns 400 when delegate already a candidate', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'nomination',
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce(null);
    // Uses composite unique key electionId_delegateId
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({ id: 1, delegateId: 1 });
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Delegate is already a candidate for this election');
  });

  it('adds candidate successfully', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, status: 'nomination', electionType: 'general' });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, partyId: 1, userId: 10 });
    mockedPrisma.electionCandidate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.electionCandidate.create.mockResolvedValueOnce({
      id: 1,
      delegateId: 1,
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    const res = await request(app)
      .post('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.delegateId).toBe(1);
  });
});

describe('DELETE /elections/:electionId/candidates/:candidateId', () => {
  beforeEach(() => {
    mockedPrisma.electionCandidate.findUnique.mockReset();
    mockedPrisma.electionCandidate.update.mockReset();
  });

  it('returns 204 when candidate not found', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/1/candidates/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when electionId does not match', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 99, // Different from URL
      election: { id: 99, programYearId: 1, status: 'nomination' },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    const res = await request(app)
      .delete('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1, // Must match URL
      election: { id: 1, programYearId: 1, status: 'nomination' },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('withdraws candidate successfully', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1, // Must match URL
      election: { id: 1, programYearId: 1, status: 'nomination' },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionCandidate.update.mockResolvedValueOnce({ id: 1, status: 'withdrawn' });
    const res = await request(app)
      .delete('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('withdrawn');
  });
});

// ============================================================
// GET SINGLE ELECTION
// ============================================================

describe('GET /elections/:id', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns election details when member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'active',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .get('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.status).toBe('active');
  });
});

// ============================================================
// VOTERS ENDPOINT
// ============================================================

describe('GET /elections/:id/voters', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999/voters')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/voters')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns voter list when member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, groupingId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([
      { voterDelegateId: 1 },
      { voterDelegateId: 2 },
    ]);
    const res = await request(app)
      .get('/elections/1/voters')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.electionId).toBe(1);
    expect(res.body.voterCount).toBe(2);
    expect(res.body.voterIds).toHaveLength(2);
  });
});

// ============================================================
// ELIGIBLE DELEGATES ENDPOINT
// ============================================================

describe('GET /elections/:id/eligible-delegates', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999/eligible-delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/eligible-delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns eligible delegates when member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      groupingId: 1,
      electionType: 'general',
      partyId: null,
      grouping: { groupingType: { levelOrder: 2 } },
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe' },
      { id: 2, firstName: 'Jane', lastName: 'Smith' },
    ]);
    mockedPrisma.electionCandidate.findMany.mockResolvedValueOnce([]); // No candidates in active elections
    const res = await request(app)
      .get('/elections/1/eligible-delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /elections/:id/candidates', () => {
  beforeEach(() => {
    mockedPrisma.election.findUnique.mockReset();
    mockedPrisma.programYear.findUnique.mockReset();
    mockedPrisma.programAssignment.findFirst.mockReset();
    mockedPrisma.electionCandidate.findMany.mockReset();
  });

  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999/candidates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not a member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns candidates list when member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionCandidate.findMany.mockResolvedValueOnce([
      { id: 1, delegateId: 10, delegate: { firstName: 'John', lastName: 'Doe' }, party: null, nominatedBy: null },
      { id: 2, delegateId: 11, delegate: { firstName: 'Jane', lastName: 'Smith' }, party: { party: { name: 'Fed' } }, nominatedBy: null },
    ]);
    const res = await request(app)
      .get('/elections/1/candidates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].delegate.firstName).toBe('John');
  });
});

describe('PUT /elections/:electionId/candidates/:candidateId', () => {
  beforeEach(() => {
    mockedPrisma.electionCandidate.findUnique.mockReset();
    mockedPrisma.electionCandidate.update.mockReset();
    mockedPrisma.programYear.findUnique.mockReset();
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  it('returns 204 when candidate not found', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1/candidates/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(204);
  });

  it('returns 204 when candidate electionId mismatch', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 99,  // Different from URL
      election: { programYearId: 1, position: { position: {} } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      election: { programYearId: 1, position: { position: {} } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      election: { programYearId: 1, position: { position: {} } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(403);
  });

  it('updates candidate to qualified when requirements met', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      declarationReceived: false,
      petitionVerified: false,
      election: { programYearId: 1, position: { position: { requiresDeclaration: true, requiresPetition: false } } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionCandidate.update.mockResolvedValueOnce({
      id: 1,
      declarationReceived: true,
      status: 'qualified',
      delegate: { firstName: 'John', lastName: 'Doe' },
      party: null,
      nominatedBy: null,
    });
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(200);
    expect(mockedPrisma.electionCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'qualified', declarationReceived: true }),
      })
    );
  });

  it('updates candidate to nominated when requirements not met', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      declarationReceived: false,
      petitionVerified: false,
      election: { programYearId: 1, position: { position: { requiresDeclaration: true, requiresPetition: true } } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionCandidate.update.mockResolvedValueOnce({
      id: 1,
      declarationReceived: true,
      status: 'nominated',
      delegate: { firstName: 'John', lastName: 'Doe' },
      party: null,
      nominatedBy: null,
    });
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ declarationReceived: true });
    expect(res.status).toBe(200);
    expect(mockedPrisma.electionCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'nominated' }),
      })
    );
  });

  it('allows withdrawing candidate', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      declarationReceived: true,
      petitionVerified: true,
      election: { programYearId: 1, position: { position: { requiresDeclaration: false, requiresPetition: false } } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionCandidate.update.mockResolvedValueOnce({
      id: 1,
      status: 'withdrawn',
      delegate: { firstName: 'John', lastName: 'Doe' },
      party: null,
      nominatedBy: null,
    });
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'withdrawn' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.electionCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'withdrawn' }),
      })
    );
  });

  it('updates petition signature count', async () => {
    mockedPrisma.electionCandidate.findUnique.mockResolvedValueOnce({
      id: 1,
      electionId: 1,
      declarationReceived: false,
      petitionVerified: false,
      election: { programYearId: 1, position: { position: { requiresDeclaration: false, requiresPetition: true } } },
      delegate: { firstName: 'John', lastName: 'Doe' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionCandidate.update.mockResolvedValueOnce({
      id: 1,
      petitionSignatureCount: 50,
      petitionVerified: true,
      status: 'qualified',
      delegate: { firstName: 'John', lastName: 'Doe' },
      party: null,
      nominatedBy: null,
    });
    const res = await request(app)
      .put('/elections/1/candidates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ petitionSignatureCount: 50, petitionVerified: true });
    expect(res.status).toBe(200);
    expect(mockedPrisma.electionCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ petitionSignatureCount: 50, petitionVerified: true }),
      })
    );
  });
});

describe('GET /elections/:id/audit', () => {
  beforeEach(() => {
    mockedPrisma.election.findUnique.mockReset();
    mockedPrisma.programYear.findUnique.mockReset();
    mockedPrisma.programAssignment.findFirst.mockReset();
    mockedPrisma.electionVote.findMany.mockReset();
    mockedPrisma.delegate.findMany.mockReset();
    mockedPrisma.electionCandidate.findMany.mockReset();
  });

  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/999/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns audit data when admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'completed',
      electionType: 'general',
      method: 'plurality',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([
      { id: 1, voterDelegateId: 10, candidateDelegateId: 20, voteRank: 1, createdAt: new Date(), createdByIp: '127.0.0.1' },
      { id: 2, voterDelegateId: 11, candidateDelegateId: 20, voteRank: 1, createdAt: new Date(), createdByIp: '127.0.0.2' },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 10, firstName: 'Voter', lastName: 'One' },
      { id: 11, firstName: 'Voter', lastName: 'Two' },
      { id: 20, firstName: 'Cand', lastName: 'Idate' },
    ]);
    mockedPrisma.electionCandidate.findMany.mockResolvedValueOnce([
      { delegateId: 20, party: { party: { name: 'Federalist' } } },
    ]);
    const res = await request(app)
      .get('/elections/1/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.election.id).toBe(1);
    expect(res.body.totalVotes).toBe(2);
    expect(res.body.votes).toHaveLength(2);
    expect(res.body.votes[0].voter.name).toBe('Voter One');
    expect(res.body.votes[0].candidate.party).toBe('Federalist');
  });
});

describe('GET /program-years/:id/election-positions', () => {
  beforeEach(() => {
    mockedPrisma.programYear.findUnique.mockReset();
    mockedPrisma.programAssignment.findFirst.mockReset();
    mockedPrisma.programYearPosition.findMany.mockReset();
    mockedPrisma.election.findMany.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/election-positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not a member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/election-positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns positions when member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', groupingType: { id: 1, name: 'City' } } },
      { id: 2, position: { id: 2, name: 'Governor', groupingType: { id: 2, name: 'State' } } },
    ]);
    mockedPrisma.election.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/program-years/1/election-positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by groupingTypeId when provided', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', groupingType: { id: 1, name: 'City' } } },
    ]);
    mockedPrisma.election.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/program-years/1/election-positions?groupingTypeId=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ============================================================
// REOPEN NOMINATIONS
// ============================================================

describe('POST /elections/:id/reopen-nominations', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/999/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'scheduled',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'scheduled',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns error for invalid status', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'nomination',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/elections/1/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
  });

  it('reopens nominations successfully', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'scheduled',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'nomination' });
    const res = await request(app)
      .post('/elections/1/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.votesPreserved).toBe(0);
  });

  it('reopens nominations with votes preserved', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      status: 'active',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { votes: 5 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'nomination' });
    const res = await request(app)
      .post('/elections/1/reopen-nominations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.votesPreserved).toBe(5);
  });
});

// ============================================================
// SKIP TO APPOINTED
// ============================================================

describe('POST /elections/:id/skip-to-appointed', () => {
  it('returns 204 when election not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/999/skip-to-appointed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      status: 'nomination',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { candidates: 0, votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/skip-to-appointed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      status: 'nomination',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { candidates: 0, votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/skip-to-appointed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns error when election has candidates with votes', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      status: 'active',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { candidates: 2, votes: 10 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/elections/1/skip-to-appointed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Cannot skip election');
  });

  it('skips election successfully', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      positionId: 1,
      status: 'nomination',
      position: { position: { name: 'Mayor' } },
      grouping: { name: 'Town A' },
      _count: { candidates: 0, votes: 0 },
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.update.mockResolvedValueOnce({ id: 1, status: 'skipped' });
    mockedPrisma.programYearPosition.update.mockResolvedValueOnce({ id: 1, isElected: false });
    const res = await request(app)
      .post('/elections/1/skip-to-appointed')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appointedPosition).toBe(true);
  });
});

// ============================================================
// ELECTION RESULTS - RANKED CHOICE & MAJORITY
// ============================================================

describe('GET /elections/:id/results - voting methods', () => {
  it('returns ranked choice results', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'ranked',
      status: 'completed',
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    // Mock for calculateRankedChoiceResult
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([
      { voterDelegateId: 10, candidateDelegateId: 1, voteRank: 1 },
      { voterDelegateId: 10, candidateDelegateId: 2, voteRank: 2 },
      { voterDelegateId: 11, candidateDelegateId: 2, voteRank: 1 },
      { voterDelegateId: 11, candidateDelegateId: 1, voteRank: 2 },
      { voterDelegateId: 12, candidateDelegateId: 1, voteRank: 1 },
    ]);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalVoters).toBeDefined();
  });

  it('returns majority results with winner', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 8 },
      { candidateDelegateId: 2, _count: 2 },
    ]);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.winner).toBeDefined();
    expect(res.body.winner.delegateId).toBe(1);
    expect(res.body.requiresRunoff).toBe(false);
  });

  it('returns majority results requiring runoff', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
        { delegateId: 3, delegate: { firstName: 'Bob', lastName: 'Jones' } },
      ],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 4 },
      { candidateDelegateId: 2, _count: 3 },
      { candidateDelegateId: 3, _count: 3 },
    ]);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.winner).toBeNull();
    expect(res.body.requiresRunoff).toBe(true);
  });
});

// ============================================================
// ELECTION LISTING - VOTE COUNTS AND LEADER INFO
// ============================================================

describe('GET /program-years/:id/elections - vote counts', () => {
  it('includes leader info for active elections', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'active',
      method: 'plurality',
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    }]);
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([{ voterDelegateId: 1 }, { voterDelegateId: 2 }]);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 5 },
      { candidateDelegateId: 2, _count: 2 },
    ]);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].leader).toBeDefined();
    expect(res.body[0].leader.delegateId).toBe(1);
  });

  it('includes requiresRunoff for majority elections', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'completed',
      method: 'majority',
      electionType: 'general',
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
        { delegateId: 3, delegate: { firstName: 'Bob', lastName: 'Jones' } },
      ],
    }]);
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([
      { voterDelegateId: 1 }, { voterDelegateId: 2 }, { voterDelegateId: 3 },
      { voterDelegateId: 4 }, { voterDelegateId: 5 }, { voterDelegateId: 6 },
    ]);
    mockedPrisma.electionVote.groupBy.mockResolvedValueOnce([
      { candidateDelegateId: 1, _count: 3 },
      { candidateDelegateId: 2, _count: 2 },
      { candidateDelegateId: 3, _count: 1 },
    ]);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].requiresRunoff).toBe(true);
  });
});

// ============================================================
// OPEN LEVEL - EXISTING ELECTIONS AND POSITION FILTERING
// ============================================================

describe('POST /program-years/:id/elections/open-level - edge cases', () => {
  beforeEach(() => {
    mockedPrisma.programYearGrouping.findMany.mockReset();
    mockedPrisma.programYearPosition.findMany.mockReset();
    mockedPrisma.programYearParty.findMany.mockReset();
    mockedPrisma.election.findFirst.mockReset();
    mockedPrisma.groupingType.findUnique.mockReset();
    mockedPrisma.program.findUnique.mockReset();
  });

  it('skips creating election when non-partisan election already exists', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, name: 'City', programId: 'abc' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { id: 1, grouping: { id: 1, name: 'Town A', groupingTypeId: 1, status: 'active' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', isNonPartisan: true, isElected: true, electionMethod: 'plurality', status: 'active' } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    // Election already exists
    mockedPrisma.election.findFirst.mockResolvedValueOnce({ id: 99, status: 'nomination' });
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(0);
    expect(res.body.errors).toContain('Election already exists for Mayor in Town A');
  });

  it('skips creating election when primary election already exists', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, name: 'City', programId: 'abc' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { id: 1, grouping: { id: 1, name: 'Town A', groupingTypeId: 1, status: 'active' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', isNonPartisan: false, isElected: true, electionMethod: 'plurality', status: 'active' } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    // Primary election already exists
    mockedPrisma.election.findFirst.mockResolvedValueOnce({ id: 99, status: 'nomination' });
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(0);
    expect(res.body.errors).toContain('Primary election already exists for Mayor in Town A (Federalist)');
  });

  it('filters positions by positionIds', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ defaultVotingMethod: 'plurality' });
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, name: 'City', programId: 'abc' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { id: 1, grouping: { id: 1, name: 'Town A', groupingTypeId: 1, status: 'active' } },
    ]);
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([
      { id: 1, position: { id: 1, name: 'Mayor', isNonPartisan: true, isElected: true, electionMethod: 'plurality', status: 'active' } },
      { id: 2, position: { id: 2, name: 'Sheriff', isNonPartisan: true, isElected: true, electionMethod: 'plurality', status: 'active' } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.election.findFirst.mockResolvedValue(null);
    mockedPrisma.election.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/elections/open-level')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, positionIds: [1] });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    // Only Mayor should be created, not Sheriff
  });
});

// ============================================================
// ELECTION LISTING - QUERY FILTERS
// ============================================================

describe('GET /program-years/:id/elections - filters', () => {
  it('filters by status', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'scheduled',
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [],
    }]);
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/program-years/1/elections?status=scheduled')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('filters by groupingId', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'nomination',
      grouping: { id: 5, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [],
    }]);
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/program-years/1/elections?groupingId=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('filters by groupingTypeId', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([
      {
        id: 1,
        programYearId: 1,
        status: 'nomination',
        grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
        candidates: [],
      },
      {
        id: 2,
        programYearId: 1,
        status: 'nomination',
        grouping: { id: 2, groupingType: { id: 2, levelOrder: 2 } },
        candidates: [],
      },
    ]);
    mockedPrisma.delegate.count.mockResolvedValue(10);
    mockedPrisma.electionVote.findMany.mockResolvedValue([]);
    const res = await request(app)
      .get('/program-years/1/elections?groupingTypeId=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].grouping.groupingType.id).toBe(1);
  });
});

// ============================================================
// RUNOFF - ADDITIONAL EDGE CASES
// ============================================================

describe('POST /elections/:id/runoff - edge cases', () => {
  it('returns 204 when program year not found after election lookup', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({
      id: 1,
      programYearId: 1,
      method: 'majority',
      status: 'completed',
      candidates: [],
    });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/runoff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

// ============================================================
// ELECTION LISTING - RCV RESULTS
// ============================================================

describe('GET /program-years/:id/elections - RCV leader', () => {
  it('calculates RCV leader for active ranked election', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.election.findMany.mockResolvedValueOnce([{
      id: 1,
      programYearId: 1,
      status: 'active',
      method: 'ranked',
      grouping: { id: 1, groupingType: { id: 1, levelOrder: 1 } },
      candidates: [
        { delegateId: 1, delegate: { firstName: 'John', lastName: 'Doe' } },
        { delegateId: 2, delegate: { firstName: 'Jane', lastName: 'Smith' } },
      ],
    }]);
    mockedPrisma.delegate.count.mockResolvedValueOnce(10);
    mockedPrisma.electionVote.findMany
      .mockResolvedValueOnce([{ voterDelegateId: 1 }, { voterDelegateId: 2 }]) // unique voters
      .mockResolvedValueOnce([ // RCV votes
        { voterDelegateId: 1, candidateDelegateId: 1, voteRank: 1 },
        { voterDelegateId: 1, candidateDelegateId: 2, voteRank: 2 },
        { voterDelegateId: 2, candidateDelegateId: 2, voteRank: 1 },
        { voterDelegateId: 2, candidateDelegateId: 1, voteRank: 2 },
      ]);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].leader).toBeDefined();
  });
});
