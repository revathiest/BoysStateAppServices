import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.position.findUnique.mockReset();
  mockedPrisma.position.update.mockReset();
  mockedPrisma.position.create.mockReset();
});

describe('Position error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Gov' });
    expect(res.status).toBe(403);
  });

  it('requires name when creating', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when updating missing position', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(404);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when deleting missing position', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
