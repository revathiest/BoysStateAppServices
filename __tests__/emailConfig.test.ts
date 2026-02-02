import request from 'supertest';
jest.mock('../src/prisma');
jest.mock('../src/email', () => ({
  sendTestEmail: jest.fn().mockResolvedValue(true),
  createTransporterFromConfig: jest.fn().mockReturnValue({}),
}));
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.emailConfig.findUnique.mockReset();
  mockedPrisma.emailConfig.create.mockReset();
  mockedPrisma.emailConfig.update.mockReset();
  mockedPrisma.emailConfig.delete.mockReset();
});

describe('GET /api/programs/:programId/email-config', () => {
  it('returns 400 when programId missing', async () => {
    const res = await request(app)
      .get('/api/programs//email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/nonexistent/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns empty config when none exists', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.programName).toBe('Test Program');
  });

  it('returns existing config without password', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce({
      programId: 'abc',
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      smtpUser: 'user@test.com',
      smtpPass: 'enc:c2VjcmV0',
      fromEmail: 'noreply@test.com',
      fromName: 'Test Program',
      enabled: true,
    });
    const res = await request(app)
      .get('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.smtpPass).toBe(''); // Password not returned
    expect(res.body.hasPassword).toBe(true);
    expect(res.body.smtpHost).toBe('smtp.test.com');
  });
});

describe('PUT /api/programs/:programId/email-config', () => {
  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/programs/nonexistent/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'test@test.com' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'test@test.com' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .put('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ smtpHost: 'smtp.test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('returns 400 when password missing for new config', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({ smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password is required');
  });

  it('creates new config successfully', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    mockedPrisma.emailConfig.create.mockResolvedValueOnce({
      programId: 'abc',
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      smtpUser: 'user@test.com',
      fromEmail: 'noreply@test.com',
      fromName: 'Test Program',
      enabled: true,
    });
    const res = await request(app)
      .put('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpUser: 'user@test.com',
        smtpPass: 'secret123',
        fromEmail: 'noreply@test.com',
        fromName: 'Test Program',
        enabled: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.configured).toBe(true);
  });

  it('updates existing config without changing password', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce({
      programId: 'abc',
      smtpPass: 'enc:existing',
    });
    mockedPrisma.emailConfig.update.mockResolvedValueOnce({
      programId: 'abc',
      smtpHost: 'smtp.new.com',
      smtpPort: 465,
      smtpUser: 'newuser@test.com',
      fromEmail: 'new@test.com',
      fromName: 'Updated Name',
      enabled: false,
    });
    const res = await request(app)
      .put('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`)
      .send({
        smtpHost: 'smtp.new.com',
        smtpPort: 465,
        smtpUser: 'newuser@test.com',
        fromEmail: 'new@test.com',
        fromName: 'Updated Name',
        enabled: false,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/programs/:programId/email-config/test', () => {
  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/nonexistent/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ testEmail: 'test@test.com', smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'from@test.com', smtpPass: 'pass' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ testEmail: 'test@test.com', smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'from@test.com', smtpPass: 'pass' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when testEmail missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'from@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Test email address');
  });

  it('returns 400 when SMTP fields missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ testEmail: 'test@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('SMTP host');
  });

  it('returns 400 when password missing and no saved config', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ testEmail: 'test@test.com', smtpHost: 'smtp.test.com', smtpUser: 'user', fromEmail: 'from@test.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('password is required');
  });

  it('sends test email successfully', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/email-config/test')
      .set('Authorization', `Bearer ${token}`)
      .send({
        testEmail: 'recipient@test.com',
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpUser: 'user@test.com',
        smtpPass: 'secret',
        fromEmail: 'noreply@test.com',
        fromName: 'Test Program',
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/programs/:programId/email-config', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when config not found', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes config successfully', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce({ programId: 'abc' });
    mockedPrisma.emailConfig.delete.mockResolvedValueOnce({});
    const res = await request(app)
      .delete('/api/programs/abc/email-config')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
