import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { verify, sign } from '../src/jwt';

const mockedPrisma = prisma as any;

describe('Auth endpoints', () => {
  beforeEach(() => {
    mockedPrisma.user.findUnique.mockReset();
    mockedPrisma.user.create.mockReset();
    jest.restoreAllMocks();
  });

  describe('POST /register', () => {
    it('creates a new user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      mockedPrisma.user.create.mockResolvedValueOnce({ id: 1 } as any);
      const res = await request(app)
        .post('/register')
        .send({ email: 'test@example.com', password: 'secret' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ message: 'User created' });
      expect(mockedPrisma.user.create).toHaveBeenCalled();
    });

    it('fails when user exists', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1 } as any);
      const res = await request(app)
        .post('/register')
        .send({ email: 'test@example.com', password: 'secret' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /login', () => {
    it('logs in with correct credentials', async () => {
      const hash = '05ffaebcca41770af425d4ba9b4e7bcdff532237dca931c192a36d94db7307d4c2df95e606514b4113ccb3ad3c19f7ca648e373a112a6b8290f3a69818aa9b7e';
      const passwordHash = `salt:${hash}`;
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'test@example.com', password: passwordHash } as any);

      const res = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'secret' });
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      const payload = verify(res.body.token, 'development-secret');
      expect(payload.userId).toBe(1);
      expect(payload.exp - payload.iat).toBe(1800);
    });

    it('fails with invalid credentials', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .post('/login')
        .send({ email: 'bad@example.com', password: 'nope' });
      expect(res.status).toBe(401);
    });

    it('rejects expired tokens', () => {
      const token = sign({ userId: 1 }, 'development-secret', -1);
      expect(() => verify(token, 'development-secret')).toThrow('Token expired');
    });
  });
});
