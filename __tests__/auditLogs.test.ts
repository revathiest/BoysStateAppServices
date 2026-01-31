import request from 'supertest';
jest.mock('../src/prisma');
import app from '../src/index';
import { sign } from '../src/jwt';
import prisma from '../src/prisma';

const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  (prisma as any).auditLog = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
});

describe('POST /audit-logs', () => {
  it('creates an audit log entry', async () => {
    (prisma as any).auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableName: 'Program', recordId: '1', userId: 1, action: 'create' });
    expect(res.status).toBe(201);
    expect((prisma as any).auditLog.create).toHaveBeenCalled();
  });

  it('requires required fields', async () => {
    const res = await request(app)
      .post('/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableName: 'Program' });
    expect(res.status).toBe(400);
  });
});

describe('GET /audit-logs', () => {
  it('returns audit logs', async () => {
    (prisma as any).auditLog.findMany.mockResolvedValueOnce([{ id: 1 }]);
    (prisma as any).auditLog.count.mockResolvedValueOnce(1);
    const res = await request(app)
      .get('/audit-logs?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auditLogs.length).toBe(1);
  });
});
