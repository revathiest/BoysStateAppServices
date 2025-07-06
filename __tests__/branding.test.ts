import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  (prisma as any).program.findUnique.mockReset();
  (prisma as any).program.update.mockReset();
  (prisma as any).programAssignment.findFirst.mockReset();
});

describe('GET /programs/:id/branding', () => {
  it('returns branding when member', async () => {
    (prisma as any).program.findUnique.mockResolvedValueOnce({ id: 'abc', brandingLogoUrl: 'logo.png' });
    (prisma as any).programAssignment.findFirst.mockResolvedValueOnce({});
    const res = await request(app)
      .get('/programs/abc/branding')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.brandingLogoUrl).toBe('logo.png');
  });
});

describe('PUT /programs/:id/branding', () => {
  it('updates branding when admin', async () => {
    (prisma as any).program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    (prisma as any).programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    (prisma as any).program.update.mockResolvedValueOnce({ id: 'abc', brandingLogoUrl: 'new.png' });
    const res = await request(app)
      .put('/programs/abc/branding')
      .set('Authorization', `Bearer ${token}`)
      .send({ brandingLogoUrl: 'new.png' });
    expect(res.status).toBe(200);
    expect((prisma as any).program.update).toHaveBeenCalled();
  });
});
