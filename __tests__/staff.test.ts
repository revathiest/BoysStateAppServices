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
  mockedPrisma.staff.create.mockReset();
  mockedPrisma.staff.findMany.mockReset();
  mockedPrisma.staff.findUnique.mockReset();
  mockedPrisma.staff.update.mockReset();
});

describe('Staff endpoints', () => {
  it('creates staff when admin', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.create.mockResolvedValueOnce({ id: 1, programYearId: 1, firstName: 'Jane' });
    const res = await request(app)
      .post('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jd@example.com', role: 'counselor' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.staff.create).toHaveBeenCalled();
  });

  it('lists staff for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.staff.findMany.mockResolvedValueOnce([{ id: 1 }]);
    const res = await request(app)
      .get('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates staff when admin', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, firstName: 'Janet' });
    const res = await request(app)
      .put('/staff/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.staff.update).toHaveBeenCalled();
  });

  it('removes staff', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, status: 'inactive' });
    const res = await request(app)
      .delete('/staff/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.staff.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'inactive' } });
  });
});

describe('POST /program-years/:id/staff - validation', () => {
  it('returns 400 when required fields missing', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' }); // Missing lastName, email, role
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });
});

describe('GET /program-years/:id/staff - enrichment', () => {
  it('enriches staff with userId with programRole info', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'delegate' }) // isProgramMember
      .mockResolvedValueOnce({ programRoleId: 5, programRole: { id: 5, name: 'Counselor' } }); // staff assignment lookup
    mockedPrisma.staff.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'Jane', userId: 10 },
    ]);
    const res = await request(app)
      .get('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].programRoleId).toBe(5);
    expect(res.body[0].programRole.name).toBe('Counselor');
  });

  it('returns null programRole for staff without userId', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.staff.findMany.mockResolvedValueOnce([
      { id: 1, firstName: 'Jane', userId: null },
    ]);
    const res = await request(app)
      .get('/program-years/1/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].programRoleId).toBeNull();
    expect(res.body[0].programRole).toBeNull();
  });
});

describe('PUT /staff/:id - tempPassword', () => {
  beforeEach(() => {
    mockedPrisma.user.update.mockReset();
  });

  it('updates password when tempPassword provided and staff has userId', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, userId: 10 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.user.update.mockResolvedValueOnce({ id: 10 });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, firstName: 'Janet' });
    const res = await request(app)
      .put('/staff/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet', tempPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: expect.objectContaining({ password: expect.any(String) }),
      })
    );
  });

  it('does not update password when staff has no userId', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 1, userId: null });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.staff.update.mockResolvedValueOnce({ id: 1, firstName: 'Janet' });
    const res = await request(app)
      .put('/staff/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet', tempPassword: 'newpassword123' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('Staff endpoints - edge cases', () => {
  it('POST returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/program-years/999/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com', role: 'counselor' });
    expect(res.status).toBe(204);
  });

  it('GET returns 204 when program year not found', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/program-years/999/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('PUT returns 204 when program year not found', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 999 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/staff/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Janet' });
    expect(res.status).toBe(204);
  });

  it('DELETE returns 204 when program year not found', async () => {
    mockedPrisma.staff.findUnique.mockResolvedValueOnce({ id: 1, programYearId: 999 });
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/staff/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
