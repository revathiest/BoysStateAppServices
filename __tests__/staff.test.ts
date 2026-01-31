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
  mockedPrisma.staff.create.mockReset();
  mockedPrisma.staff.findMany.mockReset();
  mockedPrisma.staff.findUnique.mockReset();
  mockedPrisma.staff.update.mockReset();
});

describe('Staff endpoints', () => {
  it('creates staff when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1, programYearId: 1, firstName: 'Jane' });
    const res = await request(app)
      .post('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jd@example.com', role: 'counselor' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.staff.create).toHaveBeenCalled();
  });

  it('lists staff for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.staff.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates staff when admin', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, firstName: 'Janet' });
    const res = await request(app)
      .put('/staff/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.staff.update).toHaveBeenCalled();
  });

  it('removes staff', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, status: 'inactive' });
    const res = await request(app)
      .delete('/staff/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.staff.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'inactive' } });
  });
});
