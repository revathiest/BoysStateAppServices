import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.parent.findUnique.mockReset();
  mockedPrisma.parent.update.mockReset();
  mockedPrisma.parent.create.mockReset();
  mockedPrisma.delegateParentLink.findUnique.mockReset();
  mockedPrisma.delegateParentLink.update.mockReset();
});

describe('Parent error cases', () => {
  it('rejects create when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/program-years/1/parents')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(403);
  });

  it('rejects list when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/parents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when updating missing parent', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/parents/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(404);
  });

  it('rejects update when not admin', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/parents/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when removing missing parent', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/parents/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('rejects remove when not admin', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .delete('/parents/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects link create when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .post('/delegate-parent-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 2, parentId: 3, programYearId: 1 });
    expect(res.status).toBe(403);
  });

  it('rejects link update when not admin', async () => {
    mockedPrisma.delegateParentLink.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .put('/delegate-parent-links/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(403);
  });
});
