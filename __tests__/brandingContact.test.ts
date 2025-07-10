import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programBrandingContact = {
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  };
  mockedPrisma.programBrandingContactAudit = {
    create: jest.fn(),
  };
});

describe('GET /api/branding-contact/:programId', () => {
  it('returns config when member', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({});
    mockedPrisma.programBrandingContact.findFirst.mockResolvedValueOnce({ id: '1', programId: 'abc' });
    const res = await request(app)
      .get('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.programId).toBe('abc');
  });
});

describe('POST /api/branding-contact/:programId', () => {
  it('creates config when admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programBrandingContact.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.programBrandingContact.create.mockResolvedValueOnce({ id: '1', programId: 'abc' });
    const res = await request(app)
      .post('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(mockedPrisma.programBrandingContact.create).toHaveBeenCalled();
    expect(mockedPrisma.programBrandingContactAudit.create).toHaveBeenCalled();
  });
});

describe('POST /api/branding-contact/:programId existing', () => {
  it('updates config when record exists', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programBrandingContact.findFirst.mockResolvedValueOnce({ id: '1', programId: 'abc' });
    mockedPrisma.programBrandingContact.update.mockResolvedValueOnce({ id: '1', programId: 'abc' });
    const res = await request(app)
      .post('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(mockedPrisma.programBrandingContact.update).toHaveBeenCalled();
  });
});

describe('GET /api/branding-contact/:programId forbidden', () => {
  it('rejects when not member', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/branding-contact/:programId not found', () => {
  it('returns 404 when record missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({});
    mockedPrisma.programBrandingContact.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/branding-contact/:programId forbidden', () => {
  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'member' });
    const res = await request(app)
      .post('/api/branding-contact/abc')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });
});
