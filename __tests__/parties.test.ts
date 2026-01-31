import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.party.create.mockReset();
  mockedPrisma.party.findMany.mockReset();
  mockedPrisma.party.findUnique.mockReset();
  mockedPrisma.party.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearParty.create.mockReset();
  mockedPrisma.programYearParty.findMany.mockReset();
});

describe('Party endpoints', () => {
  it('creates party when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.party.create.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Party A' });
    const res = await request(app)
      .post('/programs/abc/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Party A' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.party.create).toHaveBeenCalled();
  });

  it('lists parties for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.party.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', name: 'Party A' }]);
    const res = await request(app)
      .get('/programs/abc/parties')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates party when admin', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.party.update.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Updated' });
    const res = await request(app)
      .put('/parties/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.party.update).toHaveBeenCalled();
  });

  it('retires party', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.party.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/parties/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.party.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'retired' },
    });
  });

  it('activates parties for a program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearParty.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/parties/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ partyIds: [1] });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearParty.create).toHaveBeenCalled();
  });

  it('lists program year parties for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([{ id: 1, partyId: 1 }]);
    const res = await request(app)
      .get('/program-years/1/parties')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});
