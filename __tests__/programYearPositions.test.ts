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
});

describe('ProgramYearPosition endpoints', () => {
  it('creates program year position when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
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
