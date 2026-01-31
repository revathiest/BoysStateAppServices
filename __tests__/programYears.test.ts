import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programYear.create.mockReset();
  mockedPrisma.programYear.findFirst.mockReset();
  mockedPrisma.programYear.findMany.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYear.update.mockReset();
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.application.findMany.mockReset();
  mockedPrisma.programYearGrouping.createMany.mockReset();
  mockedPrisma.programYearParty.createMany.mockReset();
  mockedPrisma.programYearPosition.createMany.mockReset();
});

describe('ProgramYear endpoints', () => {
  it('creates a program year when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYear.create).toHaveBeenCalled();
  });

  it('lists program years for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ year: 2025 });
    mockedPrisma.programYear.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', year: 2025 }]);
    mockedPrisma.application.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].year).toBe(2025);
  });

  it('gets program year details for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app)
      .get('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('updates program year when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.update.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, status: 'archived' });
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYear.update).toHaveBeenCalled();
  });

  it('archives program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.update.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, status: 'archived' });
    const res = await request(app)
      .delete('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.programYear.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'archived' },
    });
  });
});

describe('POST /programs/:programId/years validation', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025 });
    expect(res.status).toBe(403);
  });

  it('returns 400 when year missing', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('year required');
  });

  it('creates with optional dates and notes', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      year: 2025,
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-07'),
      status: 'planning',
      notes: 'Test notes',
    });
    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({
        year: 2025,
        startDate: '2025-06-01',
        endDate: '2025-06-07',
        status: 'planning',
        notes: 'Test notes',
      });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYear.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        programId: 'abc',
        year: 2025,
        status: 'planning',
        notes: 'Test notes',
      }),
    });
  });
});

describe('POST /programs/:programId/years with copyFromPreviousYear', () => {
  it('copies groupings, parties, and positions from previous year', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({ id: 2, programId: 'abc', year: 2026 });
    mockedPrisma.programYear.findFirst.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      year: 2025,
      groupings: [{ groupingId: 'g1', status: 'active' }],
      parties: [{ partyId: 'p1', status: 'active' }],
      programYearPositions: [{ positionId: 'pos1', groupingId: 'g1', isElected: true, status: 'active' }],
    });
    mockedPrisma.programYearGrouping.createMany.mockResolvedValueOnce({ count: 1 });
    mockedPrisma.programYearParty.createMany.mockResolvedValueOnce({ count: 1 });
    mockedPrisma.programYearPosition.createMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, copyFromPreviousYear: true });

    expect(res.status).toBe(201);
    expect(mockedPrisma.programYear.findFirst).toHaveBeenCalled();
    expect(mockedPrisma.programYearGrouping.createMany).toHaveBeenCalled();
    expect(mockedPrisma.programYearParty.createMany).toHaveBeenCalled();
    expect(mockedPrisma.programYearPosition.createMany).toHaveBeenCalled();
  });

  it('handles no previous year to copy from', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programYear.findFirst.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2025, copyFromPreviousYear: true });

    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearGrouping.createMany).not.toHaveBeenCalled();
  });

  it('handles previous year with empty arrays', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.create.mockResolvedValueOnce({ id: 2, programId: 'abc', year: 2026 });
    mockedPrisma.programYear.findFirst.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      year: 2025,
      groupings: [],
      parties: [],
      programYearPositions: [],
    });

    const res = await request(app)
      .post('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`)
      .send({ year: 2026, copyFromPreviousYear: true });

    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearGrouping.createMany).not.toHaveBeenCalled();
    expect(mockedPrisma.programYearParty.createMany).not.toHaveBeenCalled();
    expect(mockedPrisma.programYearPosition.createMany).not.toHaveBeenCalled();
  });
});

describe('GET /programs/:programId/years validation', () => {
  it('returns 403 when not member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('aggregates years from program, programYears, and applications', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'member' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ year: 2023 });
    mockedPrisma.programYear.findMany.mockResolvedValueOnce([
      { id: 1, year: 2024 },
      { id: 2, year: 2025 },
    ]);
    mockedPrisma.application.findMany.mockResolvedValueOnce([
      { year: 2025 },
      { year: 2026 },
    ]);

    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(4); // 2023, 2024, 2025, 2026
    expect(res.body[0].year).toBe(2026); // Sorted descending
    expect(res.body[1]).toEqual({ id: 2, year: 2025, programId: 'abc' }); // Has id from programYear
    expect(res.body[3]).toEqual({ year: 2023, programId: 'abc' }); // No id (just from program)
  });

  it('handles missing program base year', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'member' });
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.programYear.findMany.mockResolvedValueOnce([{ id: 1, year: 2025 }]);
    mockedPrisma.application.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/programs/abc/years')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('GET /program-years/:id validation', () => {
  it('returns 204 when not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PUT /program-years/:id validation', () => {
  it('returns 204 when not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/program-years/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(res.status).toBe(403);
  });

  it('updates with dates', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYear.update.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      year: 2025,
      startDate: new Date('2025-06-01'),
      endDate: new Date('2025-06-07'),
    });
    const res = await request(app)
      .put('/program-years/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2025-06-01', endDate: '2025-06-07', notes: 'Updated' });
    expect(res.status).toBe(200);
  });
});

describe('DELETE /program-years/:id validation', () => {
  it('returns 204 when not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/program-years/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/program-years/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
