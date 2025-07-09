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
  mockedPrisma.programYearPosition.findUnique.mockReset();
  mockedPrisma.programYearPosition.update.mockReset();
  mockedPrisma.programYearPosition.create.mockReset();
});

describe('ProgramYearPosition error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 2 });
    expect(res.status).toBe(403);
  });

  it('returns 404 when program year missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 2 });
    expect(res.status).toBe(404);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when updating missing record', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 5 });
    expect(res.status).toBe(404);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 5 });
    expect(res.status).toBe(403);
  });

  it('returns 404 when deleting missing record', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.programYearPosition.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/program-year-positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
