import request from 'supertest';
import { rmSync, existsSync } from 'fs';
import path from 'path';
jest.mock('../src/prisma');
import app from '../src/index';
import { sign } from '../src/jwt';
import prisma from '../src/prisma';

describe('POST /logs', () => {
  const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
  const logsDir = path.join(__dirname, '..', 'logs');

  beforeAll(() => {
    if (existsSync(logsDir)) {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    (prisma as any).log.create.mockReset();
    (prisma as any).log.create.mockResolvedValue(null);
  });

  it('records an info log', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'info', message: 'hello' });
    expect(res.status).toBe(204);
    expect((prisma as any).log.create).toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/logs')
      .send({ programId: 'abc123', level: 'info', message: 'hello' });
    expect(res.status).toBe(401);
  });

  it('requires all fields', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ level: 'info', message: 'missing program' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid level', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'fatal', message: 'bad' });
    expect(res.status).toBe(400);
  });

  it('records a warn log', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'warn', message: 'careful' });
    expect(res.status).toBe(204);
    expect((prisma as any).log.create).toHaveBeenCalled();
  });

  it('records a debug log', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'debug', message: 'dbg' });
    expect(res.status).toBe(204);
  });

  it('records an error log with details', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'error', message: 'oops', error: 'boom' });
    expect(res.status).toBe(204);
  });
});

describe('GET /logs', () => {
  const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

  beforeEach(() => {
    (prisma as any).log.findMany.mockReset();
    (prisma as any).log.count.mockReset();
  });

  it('returns filtered logs with pagination', async () => {
    const logs = [
      {
        id: 1,
        timestamp: new Date('2025-06-01T10:20:30Z'),
        programId: 'abc123',
        level: 'info',
        message: 'hello',
        error: null,
        source: 'api',
      },
    ];
    (prisma as any).log.findMany.mockResolvedValueOnce(logs);
    (prisma as any).log.count.mockResolvedValueOnce(1);

    const res = await request(app)
      .get('/logs?programId=abc123&search=hello&dateFrom=2025-05-01&dateTo=2025-07-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(50);
    expect(res.body.total).toBe(1);
    expect((prisma as any).log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ programId: 'abc123' }),
        skip: 0,
        take: 50,
        orderBy: { timestamp: 'desc' },
      }),
    );
  });

  it('rejects invalid level filter', async () => {
    const res = await request(app)
      .get('/logs?level=fatal')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('requires auth for log retrieval', async () => {
    const res = await request(app).get('/logs');
    expect(res.status).toBe(401);
  });
});

