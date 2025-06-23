import request from 'supertest';
import crypto from 'crypto';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';

const mockedPrisma = prisma as any;

function sha(password: string) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

describe('Auth endpoints', () => {
  beforeEach(() => {
    mockedPrisma.user.create.mockReset();
    mockedPrisma.user.findUnique.mockReset();
  });

  it('registers a user', async () => {
    mockedPrisma.user.create.mockResolvedValueOnce({ id: 1, email: 'a@b.c', passwordHash: sha('pass') } as any);
    const res = await request(app).post('/register').send({ email: 'a@b.c', password: 'pass' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, email: 'a@b.c' });
    expect(mockedPrisma.user.create).toHaveBeenCalledWith({ data: { email: 'a@b.c', passwordHash: sha('pass') } });
  });

  it('rejects invalid login', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'a@b.c', passwordHash: sha('pass') } as any);
    const res = await request(app).post('/login').send({ email: 'a@b.c', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });
});
