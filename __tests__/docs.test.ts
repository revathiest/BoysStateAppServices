import request from 'supertest';
jest.mock('../src/prisma');
import app from '../src/index';

describe('GET /docs', () => {
  it('is accessible without authentication', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).not.toBe(401);
  });
});
