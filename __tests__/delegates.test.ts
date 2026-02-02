import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.delegate.create.mockReset();
  mockedPrisma.delegate.count.mockReset();
  mockedPrisma.delegate.findMany.mockReset();
  mockedPrisma.delegate.findUnique.mockReset();
  mockedPrisma.delegate.update.mockReset();
});

describe('Delegate endpoints', () => {
  it('creates delegate when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1, programYearId: 1, firstName: 'John' });
    const res = await request(app)
      .post('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'jd@example.com', groupingId: 2 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.delegate.create).toHaveBeenCalled();
  });

  it('lists delegates for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
    expect(res.body.total).toBe(1);
  });

  it('updates delegate when admin', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, firstName: 'Jane' });
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.delegate.update).toHaveBeenCalled();
  });

  it('withdraws delegate', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, status: 'withdrawn' });
    const res = await request(app)
      .delete('/delegates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.delegate.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'withdrawn' },
    });
  });
});

// ============================================================
// DELEGATE CREATION VALIDATION
// ============================================================

describe('POST /program-years/:id/delegates validation', () => {
  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'jd@example.com' });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John', lastName: 'Doe', email: 'jd@example.com' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'John' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });
});

// ============================================================
// DELEGATE UPDATE VALIDATION
// ============================================================

describe('PUT /delegates/:id validation', () => {
  it('returns 204 when delegate not found', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/delegates/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' });
    expect(res.status).toBe(403);
  });
});

// ============================================================
// DELEGATE DELETE VALIDATION
// ============================================================

describe('DELETE /delegates/:id validation', () => {
  it('returns 204 when delegate not found', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/delegates/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 204 when program year not found', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 999 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/delegates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/delegates/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// RANDOM ASSIGNMENT PREVIEW
// ============================================================

describe('POST /program-years/:id/delegates/assign/preview', () => {
  beforeEach(() => {
    mockedPrisma.programYearGrouping.findMany.mockReset();
    mockedPrisma.programYearParty.findMany.mockReset();
  });

  it('returns 404 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when no groupings found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No groupings found');
  });

  it('returns 400 when no parties found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No active parties');
  });

  it('returns 400 when no unassigned delegates', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist', color: '#FF0000' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: 1, partyId: 1, status: 'active' },
    ]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No unassigned delegates');
  });

  it('returns preview successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
      { groupingId: 2, grouping: { id: 2, name: 'Town B', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist', color: '#FF0000' } },
      { id: 2, partyId: 2, party: { id: 2, name: 'Nationalist', color: '#0000FF' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
      { id: 2, firstName: 'Jane', lastName: 'Smith', groupingId: null, partyId: null, status: 'active' },
      { id: 3, firstName: 'Bob', lastName: 'Wilson', groupingId: 1, partyId: 1, status: 'active' },
    ]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalDelegates).toBe(3);
    expect(res.body.alreadyAssigned).toBe(1);
    expect(res.body.toBeAssigned).toBe(2);
    expect(res.body.summary).toBeDefined();
    expect(res.body.assignments).toBeDefined();
  });

  it('filters out groupings without isRequired and deduplicates', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    // Include groupings without isRequired and duplicates
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
      { groupingId: 1, grouping: { id: 1, name: 'Town A (dup)', groupingType: { isRequired: true } } }, // duplicate
      { groupingId: 3, grouping: { id: 3, name: 'County', groupingType: { isRequired: false } } }, // not required
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist', color: '#FF0000' } },
      { id: 2, partyId: 1, party: { id: 1, name: 'Federalist (dup)', color: '#FF0000' } }, // duplicate party
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
    ]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign/preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Should only have 1 grouping and 1 party after filtering
  });
});

// ============================================================
// RANDOM ASSIGNMENT EXECUTION
// ============================================================

describe('POST /program-years/:id/delegates/assign', () => {
  beforeEach(() => {
    mockedPrisma.programYearGrouping.findMany.mockReset();
    mockedPrisma.programYearParty.findMany.mockReset();
  });

  it('returns 404 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when no groupings found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when no parties found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when no unassigned delegates', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: 1, partyId: 1, status: 'active' },
    ]);
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('executes assignment successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
      { id: 2, firstName: 'Jane', lastName: 'Smith', groupingId: null, partyId: null, status: 'active' },
    ]);
    mockedPrisma.delegate.update.mockResolvedValue({});
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(2);
    expect(mockedPrisma.delegate.update).toHaveBeenCalled();
  });

  it('counts already-assigned delegates in balance calculation', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    // Mix of assigned and unassigned delegates
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: 1, partyId: 1, status: 'active' }, // Already assigned
      { id: 2, firstName: 'Jane', lastName: 'Smith', groupingId: null, partyId: null, status: 'active' }, // Unassigned
    ]);
    mockedPrisma.delegate.update.mockResolvedValue({});
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(1); // Only unassigned delegate gets assigned
  });

  it('handles database error during assignment', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
    ]);
    mockedPrisma.delegate.update.mockRejectedValueOnce(new Error('Database connection failed'));
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].error).toBe('Database connection failed');
  });

  it('filters out groupings without isRequired during execution', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    // Include groupings with and without isRequired
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
      { groupingId: 2, grouping: { id: 2, name: 'County', groupingType: { isRequired: false } } },
    ]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
    ]);
    mockedPrisma.delegate.update.mockResolvedValue({});
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(1);
  });

  it('deduplicates parties during execution', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([
      { groupingId: 1, grouping: { id: 1, name: 'Town A', groupingType: { isRequired: true } } },
    ]);
    // Duplicate party entries
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([
      { id: 1, partyId: 1, party: { id: 1, name: 'Federalist' } },
      { id: 2, partyId: 1, party: { id: 1, name: 'Federalist (duplicate)' } },
    ]);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null, partyId: null, status: 'active' },
    ]);
    mockedPrisma.delegate.update.mockResolvedValue({});
    const res = await request(app)
      .post('/program-years/1/delegates/assign')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.assigned).toBe(1);
  });
});

// ============================================================
// DELEGATE LIST FILTERING
// ============================================================

describe('GET /program-years/:id/delegates filtering', () => {
  it('returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/1/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('applies search filter', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe' },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?search=john')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
  });

  it('applies unassigned grouping filter', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: null },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?groupingId=unassigned')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
  });

  it('applies party filter', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', partyId: 1 },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?partyId=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
  });

  it('applies status filter', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', status: 'active' },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?status=active')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
  });

  it('applies pagination', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(100);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 26, firstName: 'Delegate', lastName: '26' },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?page=2&limit=25')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(100);
    expect(res.body.page).toBe(2);
  });

  it('applies hierarchical grouping filter with descendants', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    // Mock getGroupingWithDescendants - first call for parent, then for child
    mockedPrisma.grouping.findMany
      .mockResolvedValueOnce([{ id: 2 }]) // children of grouping 1
      .mockResolvedValueOnce([]); // no children of grouping 2
    mockedPrisma.delegate.count.mockResolvedValueOnce(2);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', groupingId: 1 },
      { id: 2, firstName: 'Jane', lastName: 'Smith', groupingId: 2 },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?groupingId=1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(2);
  });

  it('applies unassigned party filter', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.delegate.count.mockResolvedValueOnce(1);
    mockedPrisma.delegate.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'John', lastName: 'Doe', partyId: null },
    ]);
    const res = await request(app)
      .get('/program-years/1/delegates?partyId=unassigned')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.delegates.length).toBe(1);
  });
});

// ============================================================
// DELEGATE TEMP PASSWORD
// ============================================================

describe('PUT /delegates/:id - tempPassword handling', () => {
  beforeEach(() => {
    mockedPrisma.user.update.mockReset();
  });

  it('updates password when tempPassword provided and delegate has userId', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, userId: 10 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.user.update.mockResolvedValueOnce({ id: 10 });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, firstName: 'Jane' });
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', tempPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ password: expect.any(String) }),
      })
    );
  });

  it('does not update password when delegate has no userId', async () => {
    mockedPrisma.delegate.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, userId: null });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.delegate.update.mockResolvedValueOnce({ id: 1, firstName: 'Jane' });
    const res = await request(app)
      .put('/delegates/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', tempPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });
});
