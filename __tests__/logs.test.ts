import request from 'supertest';
import { rmSync, existsSync } from 'fs';
import path from 'path';
jest.mock('../src/prisma');
import app from '../src/index';
import { sign } from '../src/jwt';

describe('POST /logs', () => {
  const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
  const logsDir = path.join(__dirname, '..', 'logs');

  beforeAll(() => {
    if (existsSync(logsDir)) {
      rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('records an info log', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'info', message: 'hello' });
    expect(res.status).toBe(204);
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
      .send({ programId: 'abc123', level: 'warn', message: 'bad' });
    expect(res.status).toBe(400);
  });

  it('records an error log with details', async () => {
    const res = await request(app)
      .post('/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({ programId: 'abc123', level: 'error', message: 'oops', error: 'boom' });
    expect(res.status).toBe(204);
  });
});
