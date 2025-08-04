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
  mockedPrisma.party.findUnique.mockReset();
});

describe('Party error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A' });
    expect(res.status).toBe(403);
  });

  it('requires name when creating', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/parties')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/parties')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 204 when updating missing party', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/parties/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'B' });
    expect(res.status).toBe(204);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/parties/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'B' });
    expect(res.status).toBe(403);
  });

  it('returns 204 when deleting missing party', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/parties/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.party.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/parties/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects activation when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/program-years/1/parties/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ partyIds: [1] });
    expect(res.status).toBe(403);
  });

  it('rejects activation with missing ids', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/parties/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects program year parties list when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/parties')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
