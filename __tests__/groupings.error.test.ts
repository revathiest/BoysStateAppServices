import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.grouping.findUnique.mockReset();
  mockedPrisma.grouping.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearGrouping.create.mockReset();
});

describe('Grouping error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, name: 'Town 1' });
    expect(res.status).toBe(403);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when updating missing grouping', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/groupings/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/groupings/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when deleting missing grouping', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/groupings/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects delete when not admin', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/groupings/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects activation when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/program-years/1/groupings/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingIds: [1] });
    expect(res.status).toBe(403);
  });

  it('rejects activation with missing ids', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/groupings/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects program year groupings list when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
