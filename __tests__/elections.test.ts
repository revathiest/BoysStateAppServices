import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

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
