import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as jest.Mocked<typeof prisma>;

describe('GET /health', () => {
  beforeEach(() => {
    mockedPrisma.$queryRaw.mockReset();
  });

  it('returns database ok when query succeeds', async () => {
    mockedPrisma.$queryRaw.mockResolvedValueOnce(1 as any);
    const token = sign({ userId: 1, email: 'test@example.com' }, 'development-secret-for-testing-only');
    const res = await request(app)
      .get('/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns database error when query fails', async () => {
    mockedPrisma.$queryRaw.mockRejectedValueOnce(new Error('fail'));
    const token = sign({ userId: 1, email: 'test@example.com' }, 'development-secret-for-testing-only');
    const res = await request(app)
      .get('/health')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'error' });
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(401);
  });
});
