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
  mockedPrisma.programYearPosition.create.mockReset();
  mockedPrisma.programYearPosition.findMany.mockReset();
  mockedPrisma.programYearPosition.findUnique.mockReset();
  mockedPrisma.programYearPosition.update.mockReset();
  mockedPrisma.position.findUnique.mockReset();
  mockedPrisma.position.findMany.mockReset();
});

describe('ProgramYearPosition endpoints', () => {
  it('creates program year position when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 2, isElected: true });
    mockedPrisma.programYearPosition.create.mockResolvedValueOnce({ id: 1, programYearId: 1, positionId: 2 });

    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 2, delegateId: 3 });

    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearPosition.create).toHaveBeenCalled();
  });

  it('requires positionId when creating', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });

    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('lists program year positions for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([{ id: 1 }]);

    const res = await request(app)
      .get('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates program year position when admin', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearPosition.update.mockResolvedValueOnce({ id: 1, delegateId: 5 });

    const res = await request(app)
      .put('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 5 });
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYearPosition.update).toHaveBeenCalled();
  });

  it('removes program year position', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearPosition.update.mockResolvedValueOnce({ id: 1, status: 'inactive' });

    const res = await request(app)
      .delete('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYearPosition.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'inactive' } });
  });
});

describe('POST /program-years/:id/positions/activate', () => {
  beforeEach(() => {
    mockedPrisma.programYearPosition.deleteMany.mockReset();
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/positions/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionIds: [1, 2] });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/positions/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionIds: [1, 2] });
    expect(res.status).toBe(403);
  });

  it('returns 400 when positionIds missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/positions/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('positionIds required');
  });

  it('returns 400 when positionIds is empty', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/positions/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('positionIds required');
  });

  it('activates positions successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearPosition.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockedPrisma.position.findMany.mockResolvedValueOnce([
      { id: 10, isElected: true },
      { id: 20, isElected: false },
    ]);
    mockedPrisma.programYearPosition.create
      .mockResolvedValueOnce({ id: 1, programYearId: 1, positionId: 10 })
      .mockResolvedValueOnce({ id: 2, programYearId: 1, positionId: 20 });
    const res = await request(app)
      .post('/program-years/1/positions/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionIds: [10, 20] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);
    expect(mockedPrisma.programYearPosition.deleteMany).toHaveBeenCalledWith({
      where: { programYearId: 1 },
    });
  });
});

describe('ProgramYearPosition edge cases', () => {
  it('GET returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('PUT returns 204 when program year not found', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 999 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 5 });
    expect(res.status).toBe(204);
  });

  it('DELETE returns 204 when program year not found', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 999 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
