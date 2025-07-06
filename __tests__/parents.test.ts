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
  mockedPrisma.parent.create.mockReset();
  mockedPrisma.parent.findMany.mockReset();
  mockedPrisma.parent.findUnique.mockReset();
  mockedPrisma.parent.update.mockReset();
  mockedPrisma.delegateParentLink.create.mockReset();
  mockedPrisma.delegateParentLink.findUnique.mockReset();
  mockedPrisma.delegateParentLink.update.mockReset();
});

describe('Parent endpoints', () => {
  it('creates parent when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.parent.create.mockResolvedValueOnce({ id: 1, programYearId: 1, firstName: 'Jane' });
    const res = await request(app)
      .post('/program-years/1/parents')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jd@example.com' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.parent.create).toHaveBeenCalled();
  });

  it('lists parents for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.parent.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/parents')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates parent when admin', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.parent.update.mockResolvedValueOnce({ id: 1, firstName: 'Janet' });
    const res = await request(app)
      .put('/parents/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.parent.update).toHaveBeenCalled();
  });

  it('removes parent', async () => {
    mockedPrisma.parent.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.parent.update.mockResolvedValueOnce({ id: 1, status: 'inactive' });
    const res = await request(app)
      .delete('/parents/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.parent.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'inactive' } });
  });
});

describe('DelegateParentLink endpoints', () => {
  it('creates link when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegateParentLink.create.mockResolvedValueOnce({ id: 1, delegateId: 2, parentId: 3 });
    const res = await request(app)
      .post('/delegate-parent-links')
      .set('Authorization', `Bearer ${token}`)
      .send({ delegateId: 2, parentId: 3, programYearId: 1 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.delegateParentLink.create).toHaveBeenCalled();
  });

  it('updates link when admin', async () => {
    mockedPrisma.delegateParentLink.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegateParentLink.update.mockResolvedValueOnce({ id: 1, status: 'accepted' });
    const res = await request(app)
      .put('/delegate-parent-links/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'accepted' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.delegateParentLink.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'accepted' } });
  });
});
