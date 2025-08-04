import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.groupingType.create.mockReset();
  mockedPrisma.groupingType.findMany.mockReset();
  mockedPrisma.groupingType.findUnique.mockReset();
  mockedPrisma.groupingType.update.mockReset();
});

describe('GroupingType endpoints', () => {
  it('creates grouping type when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.groupingType.create.mockResolvedValueOnce({ id: 1, programId: 'abc', defaultName: 'City', levelOrder: 1 });
    const res = await request(app)
      .post('/programs/abc/grouping-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultName: 'City', levelOrder: 1 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.groupingType.create).toHaveBeenCalled();
  });

  it('requires defaultName and levelOrder', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/grouping-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ levelOrder: 1 });
    expect(res.status).toBe(400);
  });

  it('lists grouping types for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.groupingType.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', defaultName: 'City', levelOrder: 1 }]);
    const res = await request(app)
      .get('/programs/abc/grouping-types')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates grouping type when admin', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.groupingType.update.mockResolvedValueOnce({ id: 1, programId: 'abc', customName: 'Town' });
    const res = await request(app)
      .put('/grouping-types/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ customName: 'Town' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.groupingType.update).toHaveBeenCalled();
  });

  it('returns 204 when grouping type not found', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/grouping-types/99')
      .set('Authorization', `Bearer ${token}`)
      .send({ customName: 'Town' });
    expect(res.status).toBe(204);
  });

  it('retires grouping type', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.groupingType.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/grouping-types/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.groupingType.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'retired' },
    });
  });
});
