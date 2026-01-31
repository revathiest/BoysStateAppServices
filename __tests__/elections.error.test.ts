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
  mockedPrisma.election.findUnique.mockReset();
  mockedPrisma.election.update.mockReset();
  mockedPrisma.election.create.mockReset();
  mockedPrisma.electionVote.create.mockReset();
});

describe('Election error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1, groupingId: 2, method: 'plurality' });
    expect(res.status).toBe(403);
  });

  it('returns 204 when program year missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1, groupingId: 2, method: 'plurality' });
    expect(res.status).toBe(204);
  });

  it('requires required fields', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects get elections when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/elections')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 204 when updating missing election', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/elections/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });
    expect(res.status).toBe(204);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/elections/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });
    expect(res.status).toBe(403);
  });

  it('returns 204 when deleting missing election', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/elections/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects vote when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({ candidateId: 2, voterId: 3 });
    expect(res.status).toBe(403);
  });

  it('requires candidate and voter ids when voting', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/elections/1/vote')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects results when not member', async () => {
    mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/elections/1/results')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
it('returns 204 when listing elections and program year missing', async () => {
  mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
  const res = await request(app)
    .get('/program-years/1/elections')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
});

it('returns 204 when voting and program year missing', async () => {
  mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
  mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
  const res = await request(app)
    .post('/elections/1/vote')
    .set('Authorization', `Bearer ${token}`)
    .send({ candidateId: 2, voterId: 3 });
  expect(res.status).toBe(204);
});

it('returns 204 when results election missing', async () => {
  mockedPrisma.election.findUnique.mockResolvedValueOnce(null);
  const res = await request(app)
    .get('/elections/1/results')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
});

it('returns 204 when results program year missing', async () => {
  mockedPrisma.election.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
  mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
  const res = await request(app)
    .get('/elections/1/results')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
});
});
