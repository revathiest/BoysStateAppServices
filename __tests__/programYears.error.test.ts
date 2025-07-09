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
  mockedPrisma.programYear.update.mockReset();
  mockedPrisma.programYear.create.mockReset();
});

describe('ProgramYear error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025 });
    expect(res.status).toBe(403);
  });

  it('requires year when creating', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when updating missing year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(404);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when deleting missing year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
it('returns 404 when getting missing program year', async () => {
  mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
  const res = await request(app)
    .get('/program-years/1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(404);
});

it('rejects get when not program member', async () => {
  mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
  mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
  const res = await request(app)
    .get('/program-years/1')
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
});
