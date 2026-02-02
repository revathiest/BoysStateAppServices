import request from 'supertest';
jest.mock('../src/prisma');
jest.mock('../src/email', () => ({
  sendAcceptanceEmail: jest.fn().mockResolvedValue(true),
}));
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.grouping.findMany.mockReset();
  mockedPrisma.party.findMany.mockReset();
  mockedPrisma.programYearGrouping.findMany.mockReset();
  mockedPrisma.programYearParty.findMany.mockReset();
  mockedPrisma.user.findMany.mockReset();
  mockedPrisma.user.findUnique.mockReset();
  mockedPrisma.user.create.mockReset();
  mockedPrisma.delegate.findFirst.mockReset();
  mockedPrisma.delegate.create.mockReset();
  mockedPrisma.staff.findFirst.mockReset();
  mockedPrisma.staff.create.mockReset();
  mockedPrisma.parent.findFirst.mockReset();
  mockedPrisma.parent.create.mockReset();
  mockedPrisma.delegateParentLink.findFirst.mockReset();
  mockedPrisma.delegateParentLink.create.mockReset();
  mockedPrisma.programAssignment.create.mockReset();
});

describe('GET /programs/:programId/bulk/template/:type', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/bulk/template/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid type', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .get('/programs/abc/bulk/template/invalid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Type must be "delegates" or "staff"');
  });

  it('returns CSV template for delegates', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.findMany.mockResolvedValueOnce([{ name: 'Town A' }]);
    mockedPrisma.party.findMany.mockResolvedValueOnce([{ name: 'Federalist' }]);
    const res = await request(app)
      .get('/programs/abc/bulk/template/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('firstName,lastName,email');
  });

  it('returns CSV template for staff', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.findMany.mockResolvedValueOnce([{ name: 'Town A' }]);
    mockedPrisma.party.findMany.mockResolvedValueOnce([{ name: 'Federalist' }]);
    const res = await request(app)
      .get('/programs/abc/bulk/template/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('firstName,lastName,email,phone,role,groupingName');
  });
});

describe('GET /programs/:programId/bulk/options/:type', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/bulk/options/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns options for bulk import', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.grouping.findMany.mockResolvedValueOnce([{ id: 1, name: 'Town A' }]);
    mockedPrisma.party.findMany.mockResolvedValueOnce([{ id: 1, name: 'Federalist' }]);
    const res = await request(app)
      .get('/programs/abc/bulk/options/delegates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.groupings).toHaveLength(1);
    expect(res.body.parties).toHaveLength(1);
    expect(res.body.roles).toContain('administrator');
  });
});

describe('POST /program-years/:id/bulk/preview/:type', () => {
  it('returns 400 when csvContent missing', async () => {
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('csvContent is required');
  });

  it('returns 404 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid type', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/bulk/preview/invalid')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no data rows in CSV', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No data rows found in CSV');
  });

  it('previews delegate import successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(1);
    expect(res.body.validRows).toBe(1);
  });

  it('returns validation errors for invalid delegate data', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\n,Doe,invalid-email,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.validRows).toBe(0);
  });

  it('previews staff import successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    // Mock year-activated groupings with included grouping object
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ groupingId: 1, grouping: { id: 1, name: 'Town A' } }]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,Town A';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.totalRows).toBe(1);
    expect(res.body.validRows).toBe(1);
  });
});

describe('POST /program-years/:id/bulk/import/:type', () => {
  it('returns 400 when csvContent missing', async () => {
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', program: { name: 'Test' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(403);
  });

  it('imports delegates successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin check
      .mockResolvedValueOnce(null); // No existing assignment for user
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null); // No existing user
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null); // No existing delegate
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.usersCreated).toBe(1);
  });

  it('imports staff successfully', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin check
      .mockResolvedValueOnce(null); // No existing assignment
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ groupingId: 1, grouping: { id: 1, name: 'town a' } }]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'jane@test.com' });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,Town A';
    const res = await request(app)
      .post('/program-years/1/bulk/import/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
  });

  it('skips existing delegates', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce({ id: 1 }); // Existing delegate

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.success).toBe(0);
  });

  it('skips existing staff', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'jane@test.com' });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce({ id: 1 }); // Existing staff

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.success).toBe(0);
  });

  it('imports delegates with parent info and creates parent', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce(null) // delegate assignment
      .mockResolvedValueOnce(null); // parent assignment
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null) // Delegate user not exists
      .mockResolvedValueOnce(null); // Parent user not exists
    mockedPrisma.user.create
      .mockResolvedValueOnce({ id: 10, email: 'john@test.com' }) // Create delegate user
      .mockResolvedValueOnce({ id: 11, email: 'parent@test.com' }); // Create parent user
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.parent.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.parent.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.delegateParentLink.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegateParentLink.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValue({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,Jane,Doe,parent@test.com,555-5678';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.parentsCreated).toBe(1);
    expect(mockedPrisma.parent.create).toHaveBeenCalled();
    expect(mockedPrisma.delegateParentLink.create).toHaveBeenCalled();
  });

  it('links to existing parent if already exists', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null) // Delegate user not exists
      .mockResolvedValueOnce({ id: 11, email: 'parent@test.com' }); // Parent user exists
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.parent.findFirst.mockResolvedValueOnce({ id: 5 }); // Parent already exists
    mockedPrisma.delegateParentLink.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegateParentLink.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValue({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,Jane,Doe,parent@test.com,555-5678';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.parentsCreated).toBe(0); // Parent already existed
    expect(mockedPrisma.delegateParentLink.create).toHaveBeenCalled();
  });

  it('does not re-create existing delegate-parent link', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 11, email: 'parent@test.com' });
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.parent.findFirst.mockResolvedValueOnce({ id: 5 });
    mockedPrisma.delegateParentLink.findFirst.mockResolvedValueOnce({ id: 99 }); // Link already exists
    mockedPrisma.programAssignment.create.mockResolvedValue({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,Jane,Doe,parent@test.com,555-5678';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(mockedPrisma.delegateParentLink.create).not.toHaveBeenCalled();
  });
});

describe('POST /program-years/:id/bulk/preview - parent counting', () => {
  it('counts new parents in delegate preview', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]); // No existing users

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,Jane,Doe,parent@test.com,555-5678';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.newParents).toBe(1);
  });

  it('does not count existing parent emails', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([{ email: 'parent@test.com' }]); // Parent already exists

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,Jane,Doe,parent@test.com,555-5678';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.newParents).toBe(0);
  });
});

describe('POST /program-years/:id/bulk/import - edge cases', () => {
  it('returns 400 for invalid type in import', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', program: { name: 'Test' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/bulk/import/invalid')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email\nJohn,Doe,john@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Type must be "delegates" or "staff"');
  });

  it('returns 400 when no data rows in import CSV', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', program: { name: 'Test' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent: 'firstName,lastName,email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('No data rows found in CSV');
  });

  it('tracks failed row when validation fails during import', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);

    // CSV with invalid data (missing firstName)
    const csvContent = 'firstName,lastName,email\n,Doe,john@test.com';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].error).toContain('first name is required');
  });

  it('tracks error when database throws exception during import', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockRejectedValueOnce(new Error('Database connection failed'));

    const csvContent = 'firstName,lastName,email\nJohn,Doe,john@test.com';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: false });
    expect(res.status).toBe(200);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors.length).toBe(1);
    expect(res.body.errors[0].error).toBe('Database connection failed');
  });
});

describe('POST /program-years/:id/bulk/preview - validation errors', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
    mockedPrisma.programYear.findUnique.mockReset();
    mockedPrisma.grouping.findMany.mockReset();
    mockedPrisma.party.findMany.mockReset();
    mockedPrisma.programYearParty.findMany.mockReset();
    mockedPrisma.user.findMany.mockReset();
  });

  it('returns validation error for missing lastName in delegate', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email\nJohn,,john@test.com';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(0);
    expect(res.body.errors.some((e: any) => e.field === 'lastName')).toBe(true);
  });

  it('returns validation error for missing email in delegate', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email\nJohn,Doe,';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(0);
    expect(res.body.errors.some((e: any) => e.field === 'email')).toBe(true);
  });

  it('returns validation error for invalid parent email', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,parentFirstName,parentLastName,parentEmail\nJohn,Doe,john@test.com,,,invalid-email';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.errors.some((e: any) => e.field === 'parentEmail')).toBe(true);
  });

  it('returns validation error when parent email provided without parent name', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,parentFirstName,parentLastName,parentEmail\nJohn,Doe,john@test.com,,,parent@test.com';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.errors.some((e: any) => e.field === 'parentFirstName')).toBe(true);
    expect(res.body.errors.some((e: any) => e.field === 'parentLastName')).toBe(true);
  });

  it('returns validation errors for staff with missing fields', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\n,Smith,,555-4321,,';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(0);
    expect(res.body.errors.some((e: any) => e.field === 'firstName')).toBe(true);
    expect(res.body.errors.some((e: any) => e.field === 'email')).toBe(true);
    expect(res.body.errors.some((e: any) => e.field === 'role')).toBe(true);
  });

  it('returns validation error for invalid staff role', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,invalidrole,';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(0);
    expect(res.body.errors.some((e: any) => e.field === 'role')).toBe(true);
  });

  it('returns warning for unknown grouping in staff import', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]); // No groupings activated
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,NonExistentTown';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(1); // Still valid, just warning
    expect(res.body.warnings.some((w: any) => w.field === 'groupingName')).toBe(true);
  });

  it('handles CSV with quoted values containing commas', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findMany.mockResolvedValueOnce([]);

    const csvContent = 'firstName,lastName,email\n"John, Jr",Doe,john@test.com';
    const res = await request(app)
      .post('/program-years/1/bulk/preview/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent });
    expect(res.status).toBe(200);
    expect(res.body.validRows).toBe(1);
    expect(res.body.preview[0].data.firstName).toBe('John, Jr');
  });
});

describe('POST /program-years/:id/bulk/import - email sending', () => {
  const { sendAcceptanceEmail } = require('../src/email');

  beforeEach(() => {
    sendAcceptanceEmail.mockClear();
  });

  it('sends welcome email to delegate when sendEmails is true', async () => {
    sendAcceptanceEmail.mockResolvedValueOnce(true);
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsSent).toBe(1);
    expect(sendAcceptanceEmail).toHaveBeenCalledWith(
      'abc', 'john@test.com', 'John', 'Doe', 'Test Program', 2025, 'delegate', undefined, expect.any(String)
    );
  });

  it('tracks email failure for delegate when email send fails', async () => {
    sendAcceptanceEmail.mockResolvedValueOnce(false);
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsFailed).toBe(1);
  });

  it('tracks email exception for delegate', async () => {
    sendAcceptanceEmail.mockRejectedValueOnce(new Error('SMTP error'));
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'john@test.com' });
    mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.delegate.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,parentFirstName,parentLastName,parentEmail,parentPhone\nJohn,Doe,john@test.com,555-1234,,,,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/delegates')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsFailed).toBe(1);
  });

  it('sends welcome email to staff when sendEmails is true', async () => {
    sendAcceptanceEmail.mockResolvedValueOnce(true);
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([{ groupingId: 1, grouping: { id: 1, name: 'town a' } }]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'jane@test.com' });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,Town A';
    const res = await request(app)
      .post('/program-years/1/bulk/import/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsSent).toBe(1);
    expect(sendAcceptanceEmail).toHaveBeenCalledWith(
      'abc', 'jane@test.com', 'Jane', 'Smith', 'Test Program', 2025, 'staff', 'counselor', expect.any(String)
    );
  });

  it('tracks email failure for staff when email send fails', async () => {
    sendAcceptanceEmail.mockResolvedValueOnce(false);
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'jane@test.com' });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsFailed).toBe(1);
  });

  it('tracks email exception for staff', async () => {
    sendAcceptanceEmail.mockRejectedValueOnce(new Error('SMTP error'));
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025, program: { name: 'Test Program' } });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' })
      .mockResolvedValueOnce(null);
    mockedPrisma.programYearGrouping.findMany.mockResolvedValueOnce([]);
    mockedPrisma.programYearParty.findMany.mockResolvedValueOnce([]);
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 10, email: 'jane@test.com' });
    mockedPrisma.staff.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1 });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});

    const csvContent = 'firstName,lastName,email,phone,role,groupingName\nJane,Smith,jane@test.com,555-4321,counselor,';
    const res = await request(app)
      .post('/program-years/1/bulk/import/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ csvContent, sendEmails: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.emailsFailed).toBe(1);
  });
});
