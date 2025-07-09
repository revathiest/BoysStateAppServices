import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.grouping.create.mockReset();
  mockedPrisma.grouping.findMany.mockReset();
  mockedPrisma.grouping.findUnique.mockReset();
  mockedPrisma.grouping.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearGrouping.create.mockReset();
  mockedPrisma.programYearGrouping.findMany.mockReset();
});

describe('Grouping endpoints', () => {
  it('creates grouping when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.create.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Town 1' });
    const res = await request(app)
      .post('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, name: 'Town 1' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.grouping.create).toHaveBeenCalled();
  });

  it('lists groupings for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.grouping.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', name: 'Town 1' }]);
    const res = await request(app)
      .get('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates grouping when admin', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.update.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Updated' });
    const res = await request(app)
      .put('/groupings/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.grouping.update).toHaveBeenCalled();
  });

  it('retires grouping', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/groupings/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.grouping.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'retired' },
    });
  });

  it('activates groupings for a program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/groupings/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingIds: [1] });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearGrouping.create).toHaveBeenCalled();
  });

  it('lists program year groupings for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ id: 1, groupingId: 1 }]);
    const res = await request(app)
      .get('/program-years/1/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
