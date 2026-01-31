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
  mockedPrisma.delegate.create.mockReset();
  mockedPrisma.delegate.findMany.mockReset();
  mockedPrisma.delegate.findUnique.mockReset();
  mockedPrisma.delegate.update.mockReset();
});

describe('Delegate endpoints', () => {
  it('creates delegate when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1, programYearId: 1, firstName: 'John' });
    const res = await request(app)
      .post('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'jd@example.com', groupingId: 2 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.delegate.create).toHaveBeenCalled();
  });

  it('lists delegates for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates delegate when admin', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, firstName: 'Jane' });
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.delegate.update).toHaveBeenCalled();
  });

  it('withdraws delegate', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, status: 'withdrawn' });
    const res = await request(app)
      .delete('/delegates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.delegate.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'withdrawn' },
    });
  });
});
