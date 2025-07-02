import request from 'supertest';
jest.mock('../src/prisma');
import app, { swaggerDoc } from '../src/index';

describe('GET /docs', () => {
  it('is accessible without authentication', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).not.toBe(401);
  });

  it('uses a local server url when not in production', () => {
    expect(swaggerDoc.servers[0].url).toMatch('http://localhost');
  });
});
