import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programYear.create.mockReset();
  mockedPrisma.programYear.findMany.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYear.update.mockReset();
});

describe('ProgramYear endpoints', () => {
  it('creates a program year when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYear.create).toHaveBeenCalled();
  });

  it('lists program years for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYear.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', year: 2025 }]);
    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('gets program year details for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .get('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('updates program year when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.update.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, status: 'archived' });
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYear.update).toHaveBeenCalled();
  });

  it('archives program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.update.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, status: 'archived' });
    const res = await request(app)
      .delete('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYear.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'archived' },
    });
  });
});
