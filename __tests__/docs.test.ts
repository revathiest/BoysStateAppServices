import request from 'supertest';
jest.mock('../src/prisma');
import app, { swaggerDoc } from '../src/index';

describe('GET /docs', () => {
  it('is accessible without authentication', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).not.toBe(401);
  });

  
  it('can return swagger.json', async () => {
    const res = await request(app).get('/docs/swagger.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.0');
  });

  it('contains a download link for swagger.json', async () => {
    const res = await request(app).get('/docs/');
    expect(res.text).toMatch('swagger-ui-custom.js');
  });

  it('serves the custom javascript', async () => {
    const res = await request(app).get('/docs/swagger-ui-custom.js');
    expect(res.status).toBe(200);
    expect(res.text).toMatch('Download swagger.json');
  });
    
  it('uses a local server url when not in production', () => {
    expect(swaggerDoc.servers[0].url).toMatch('http://localhost');
    
  });
});