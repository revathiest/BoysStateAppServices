import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
const mockedPrisma = prisma as any;

beforeEach(() => {
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.applicationResponse.findMany.mockReset();
  mockedPrisma.applicationResponse.findFirst.mockReset();
  mockedPrisma.applicationResponse.update.mockReset();
  mockedPrisma.auditLog.create.mockReset();
});

describe('GET /api/programs/:id/applications/delegate', () => {
  it('returns list for admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      { id: 'app1', status: 'pending' },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST accept application', () => {
  it('accepts pending application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'ok' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.update).toHaveBeenCalledWith({
      where: { id: 'resp1' },
      data: { status: 'accepted' },
    });
  });

  it('rejects already decided', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'accepted' });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('forbids accept when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST reject application', () => {
  it('rejects pending application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'no' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.update).toHaveBeenCalledWith({
      where: { id: 'resp1' },
      data: { status: 'rejected' },
    });
  });

  it('returns 404 when application missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

