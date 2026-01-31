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
    mockedPrisma.election.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('records vote and returns results', async () => {
    mockedPrisma.election.findUnique.mockResolvedValue({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValue({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValue({ role: 'delegate' });
    mockedPrisma.electionVote.create.mockResolvedValue({ id: 10 });
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
    expect(res.body.error).toBe('positionId, groupingId and method required');
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
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1, voterId: 2 });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 1, voterId: 2 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
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
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.electionVote.create.mockResolvedValueOnce({ id: 10 });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3, rank: 1 });
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
