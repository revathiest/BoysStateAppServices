import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.position.create.mockReset();
  mockedPrisma.position.findMany.mockReset();
  mockedPrisma.position.findUnique.mockReset();
  mockedPrisma.position.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearPosition.create.mockReset();
  mockedPrisma.programYearPosition.findMany.mockReset();
});

describe('Position endpoints', () => {
  it('creates position when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Governor' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Governor' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.position.create).toHaveBeenCalled();
  });

  it('lists positions for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.position.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', name: 'Governor' }]);
    const res = await request(app)
      .get('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates position when admin', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Updated' });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalled();
  });

  it('retires position', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'retired' } });
  });

  it('assigns position for a program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearPosition.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearPosition.create).toHaveBeenCalled();
  });

  it('lists program year positions for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([{ id: 1, positionId: 1 }]);
    const res = await request(app)
      .get('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
