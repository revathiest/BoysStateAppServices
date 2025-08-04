import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.groupingType.findUnique.mockReset();
  mockedPrisma.groupingType.update.mockReset();
});

describe('GroupingType error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/grouping-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultName: 'City', levelOrder: 1 });
    expect(res.status).toBe(403);
  });

  it('rejects listing when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/grouping-types')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/grouping-types/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ customName: 'Town' });
    expect(res.status).toBe(403);
  });

  it('returns 204 when deleting missing type', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/grouping-types/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.groupingType.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/grouping-types/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
