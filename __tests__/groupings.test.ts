import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.grouping.create.mockReset();
  mockedPrisma.grouping.findMany.mockReset();
  mockedPrisma.grouping.findUnique.mockReset();
  mockedPrisma.grouping.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearGrouping.create.mockReset();
  mockedPrisma.programYearGrouping.deleteMany.mockReset();
  mockedPrisma.programYearGrouping.findMany.mockReset();
});

describe('Grouping endpoints', () => {
  it('creates grouping when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.create.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Town 1' });
    const res = await request(app)
      .post('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingTypeId: 1, name: 'Town 1' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.grouping.create).toHaveBeenCalled();
  });

  it('lists groupings for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.grouping.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', name: 'Town 1' }]);
    const res = await request(app)
      .get('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates grouping when admin', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.update.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Updated' });
    const res = await request(app)
      .put('/groupings/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.grouping.update).toHaveBeenCalled();
  });

  it('retires grouping', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/groupings/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.grouping.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'retired' },
    });
  });

  it('activates groupings for a program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockedPrisma.programYearGrouping.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/groupings/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingIds: [1] });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearGrouping.create).toHaveBeenCalled();
  });

  it('lists program year groupings for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ id: 1, groupingId: 1 }]);
    const res = await request(app)
      .get('/program-years/1/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('Grouping validation', () => {
  it('POST requires groupingTypeId and name', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/groupings')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('groupingTypeId and name required');
  });

  it('PUT returns 204 when grouping not found', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/groupings/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(204);
  });

  it('DELETE returns 204 when grouping not found', async () => {
    mockedPrisma.grouping.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/groupings/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('POST activate returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/groupings/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupingIds: [1] });
    expect(res.status).toBe(204);
  });

  it('GET program year groupings returns 204 when py not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/groupings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
