import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.emailTemplate.findMany.mockReset();
  mockedPrisma.emailTemplate.findUnique.mockReset();
  mockedPrisma.emailTemplate.upsert.mockReset();
  mockedPrisma.emailTemplate.deleteMany.mockReset();
});

describe('GET /api/programs/:programId/email-templates', () => {
  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/nonexistent/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns templates with defaults when none configured', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/programs/abc/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.templates).toBeDefined();
    expect(res.body.templates.length).toBeGreaterThan(0);
    expect(res.body.templates[0].isCustomized).toBe(false);
  });

  it('returns customized templates when configured', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.findMany.mockResolvedValueOnce([
      {
        templateType: 'delegate_welcome',
        subject: 'Custom Subject',
        body: 'Custom Body',
        enabled: true,
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/email-templates')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const delegateTemplate = res.body.templates.find((t: any) => t.templateType === 'delegate_welcome');
    expect(delegateTemplate.subject).toBe('Custom Subject');
    expect(delegateTemplate.isCustomized).toBe(true);
  });
});

describe('GET /api/programs/:programId/email-templates/:templateType', () => {
  it('returns 400 for invalid template type', async () => {
    const res = await request(app)
      .get('/api/programs/abc/email-templates/invalid_type')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid template type');
  });

  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/nonexistent/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns default template when not customized', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.templateType).toBe('delegate_welcome');
    expect(res.body.isCustomized).toBe(false);
    expect(res.body.subject).toContain('Welcome');
  });

  it('returns customized template', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.findUnique.mockResolvedValueOnce({
      subject: 'Custom Subject',
      body: '<p>Custom Body</p>',
      enabled: false,
    });
    const res = await request(app)
      .get('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe('Custom Subject');
    expect(res.body.isCustomized).toBe(true);
    expect(res.body.enabled).toBe(false);
  });
});

describe('PUT /api/programs/:programId/email-templates/:templateType', () => {
  it('returns 400 for invalid template type', async () => {
    const res = await request(app)
      .put('/api/programs/abc/email-templates/invalid_type')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Test', body: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid template type');
  });

  it('returns 404 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/programs/nonexistent/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Test', body: 'Test' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Test', body: 'Test' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when subject or body missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .put('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({ subject: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
  });

  it('creates or updates template successfully', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc', name: 'Test Program' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.upsert.mockResolvedValueOnce({
      programId: 'abc',
      templateType: 'delegate_welcome',
      subject: 'Custom Welcome Subject',
      body: '<p>Custom welcome body</p>',
      enabled: true,
    });
    const res = await request(app)
      .put('/api/programs/abc/email-templates/delegate_welcome')
      .set('Authorization', `Bearer ${token}`)
      .send({
        subject: 'Custom Welcome Subject',
        body: '<p>Custom welcome body</p>',
        enabled: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isCustomized).toBe(true);
  });
});

describe('POST /api/programs/:programId/email-templates/:templateType/reset', () => {
  it('returns 400 for invalid template type', async () => {
    const res = await request(app)
      .post('/api/programs/abc/email-templates/invalid_type/reset')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/email-templates/delegate_welcome/reset')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('resets template to default successfully', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.emailTemplate.deleteMany.mockResolvedValueOnce({ count: 1 });
    const res = await request(app)
      .post('/api/programs/abc/email-templates/delegate_welcome/reset')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isCustomized).toBe(false);
  });
});

// Test the exported helper functions
describe('getEmailTemplate helper', () => {
  // Import after mocking
  const { getEmailTemplate } = require('../src/routes/emailTemplates');

  it('returns custom template when exists', async () => {
    mockedPrisma.emailTemplate.findUnique.mockResolvedValueOnce({
      subject: 'Custom',
      body: 'Body',
      enabled: true,
    });
    const result = await getEmailTemplate('abc', 'delegate_welcome');
    expect(result?.subject).toBe('Custom');
    expect(result?.enabled).toBe(true);
  });

  it('returns default template when custom not exists', async () => {
    mockedPrisma.emailTemplate.findUnique.mockResolvedValueOnce(null);
    const result = await getEmailTemplate('abc', 'delegate_welcome');
    expect(result).not.toBeNull();
    expect(result?.subject).toContain('Welcome');
    expect(result?.enabled).toBe(true);
  });

  it('returns null for unknown template type', async () => {
    mockedPrisma.emailTemplate.findUnique.mockResolvedValueOnce(null);
    const result = await getEmailTemplate('abc', 'unknown_type');
    expect(result).toBeNull();
  });
});

describe('renderTemplate helper', () => {
  const { renderTemplate } = require('../src/routes/emailTemplates');

  it('replaces simple placeholders', () => {
    const template = 'Hello {{firstName}} {{lastName}}!';
    const result = renderTemplate(template, { firstName: 'John', lastName: 'Doe' });
    expect(result).toBe('Hello John Doe!');
  });

  it('handles missing values by keeping placeholder', () => {
    const template = 'Hello {{firstName}} {{lastName}}!';
    const result = renderTemplate(template, { firstName: 'John' });
    expect(result).toBe('Hello John {{lastName}}!');
  });

  it('replaces with empty string when value is undefined', () => {
    const template = 'Hello {{firstName}} {{lastName}}!';
    const result = renderTemplate(template, { firstName: 'John', lastName: undefined });
    expect(result).toBe('Hello John !');
  });

  it('handles conditional blocks when variable present', () => {
    const template = 'Welcome{{#if tempPassword}} - Password: {{tempPassword}}{{/if}}!';
    const result = renderTemplate(template, { tempPassword: 'abc123' });
    expect(result).toBe('Welcome - Password: abc123!');
  });

  it('removes conditional blocks when variable missing', () => {
    const template = 'Welcome{{#if tempPassword}} - Password: {{tempPassword}}{{/if}}!';
    const result = renderTemplate(template, {});
    expect(result).toBe('Welcome!');
  });
});
