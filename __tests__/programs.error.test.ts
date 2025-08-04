import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.program.update.mockReset();
  mockedPrisma.program.create.mockReset();
});

describe('Program error cases', () => {
  it('rejects program creation when missing fields', async () => {
    mockedPrisma.program.create.mockResolvedValueOnce({ id: 'p1', name: 'Test', year: 2025 });
    const res = await request(app)
      .post('/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('rejects user assignment when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 2, role: 'counselor' });
    expect(res.status).toBe(403);
  });

  it('rejects listing users when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .get('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 204 when updating missing program', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/programs/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(204);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/programs/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(403);
  });
it('returns 204 when getting missing program', async () => {
  mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
  const res = await request(app).get('/programs/p1').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
});

it('rejects get program when not member', async () => {
  mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'p1' });
  mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
  const res = await request(app).get('/programs/p1').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});


it('returns 204 when deleting missing program', async () => {
  mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
  const res = await request(app).delete('/programs/p1').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(204);
});

it('rejects delete when not admin', async () => {
  mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'p1' });
  mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
  const res = await request(app).delete('/programs/p1').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(403);
});
});
