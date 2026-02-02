import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app, { loginAttempts } from '../src/index';
import { verify, sign } from '../src/jwt';

const mockedPrisma = prisma as any;

describe('Auth endpoints', () => {
  beforeEach(() => {
    mockedPrisma.user.findUnique.mockReset();
    mockedPrisma.user.create.mockReset();
    jest.restoreAllMocks();
    loginAttempts.clear();
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

    it('requires email and password', async () => {
      const res = await request(app).post('/register').send({});
      expect(res.status).toBe(400);
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
      const payload = verify(res.body.token, 'development-secret-for-testing-only');
      expect(payload.userId).toBe(1);
      expect(payload.email).toBe('test@example.com');
      expect(payload.exp - payload.iat).toBe(1800);
    });

    it('fails with invalid credentials', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .post('/login')
        .send({ email: 'bad@example.com', password: 'nope' });
      expect(res.status).toBe(401);
    });

    it('requires email and password', async () => {
      const res = await request(app).post('/login').send({});
      expect(res.status).toBe(400);
    });

    it('rate limits after repeated failures', async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null as any);
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/login')
          .send({ email: 'bad@example.com', password: 'nope' });
        expect(res.status).toBe(401);
      }
      const res = await request(app)
        .post('/login')
        .send({ email: 'bad@example.com', password: 'nope' });
      expect(res.status).toBe(429);
    });

    it('clears failed attempt count after successful login', async () => {
      const hash = '05ffaebcca41770af425d4ba9b4e7bcdff532237dca931c192a36d94db7307d4c2df95e606514b4113ccb3ad3c19f7ca648e373a112a6b8290f3a69818aa9b7e';
      const passwordHash = `salt:${hash}`;
      mockedPrisma.user.findUnique.mockResolvedValue(null as any);
      for (let i = 0; i < 2; i++) {
        await request(app)
          .post('/login')
          .send({ email: 'bad@example.com', password: 'nope' });
      }
      mockedPrisma.user.findUnique.mockResolvedValue({ id: 1, email: 'test@example.com', password: passwordHash } as any);
      const success = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'secret' });
      expect(success.status).toBe(200);

      mockedPrisma.user.findUnique.mockResolvedValue(null as any);
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/login')
          .send({ email: 'bad@example.com', password: 'nope' });
        expect(res.status).toBe(401);
      }
    });

    it('rejects expired tokens', () => {
      const token = sign({ userId: 1, email: 'test@example.com' }, 'development-secret-for-testing-only', -1);
      expect(() => verify(token, 'development-secret-for-testing-only')).toThrow('Token expired');
    });

    it('fails with wrong password when user exists', async () => {
      // Use a proper salt:hash format that won't match 'wrongpassword'
      const correctHash = '05ffaebcca41770af425d4ba9b4e7bcdff532237dca931c192a36d94db7307d4c2df95e606514b4113ccb3ad3c19f7ca648e373a112a6b8290f3a69818aa9b7e';
      const passwordHash = `salt:${correctHash}`;
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'test@example.com', password: passwordHash } as any);
      const res = await request(app)
        .post('/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  describe('POST /refresh', () => {
    const token = sign({ userId: 1, email: 'test@example.com' }, 'development-secret-for-testing-only');

    it('refreshes token for authenticated user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'test@example.com' } as any);
      const res = await request(app)
        .post('/refresh')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
    });

    it('returns 401 when user not found', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .post('/refresh')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('User not found');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app).post('/refresh');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /change-password', () => {
    const token = sign({ userId: 1, email: 'test@example.com' }, 'development-secret-for-testing-only');

    beforeEach(() => {
      mockedPrisma.user.update.mockReset();
    });

    it('changes password successfully', async () => {
      // Hash for 'currentpassword'
      const correctHash = '05ffaebcca41770af425d4ba9b4e7bcdff532237dca931c192a36d94db7307d4c2df95e606514b4113ccb3ad3c19f7ca648e373a112a6b8290f3a69818aa9b7e';
      const passwordHash = `salt:${correctHash}`;
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'test@example.com', password: passwordHash } as any);
      mockedPrisma.user.update.mockResolvedValueOnce({ id: 1 } as any);
      const res = await request(app)
        .put('/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'secret', newPassword: 'newpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password changed successfully');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .put('/change-password')
        .send({ currentPassword: 'old', newPassword: 'newpassword' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when passwords missing', async () => {
      const res = await request(app)
        .put('/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 400 when new password too short', async () => {
      const res = await request(app)
        .put('/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'old', newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });

    it('returns 404 when user not found', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .put('/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'old', newPassword: 'newpassword123' });
      expect(res.status).toBe(404);
    });

    it('returns 401 when current password incorrect', async () => {
      const correctHash = '05ffaebcca41770af425d4ba9b4e7bcdff532237dca931c192a36d94db7307d4c2df95e606514b4113ccb3ad3c19f7ca648e373a112a6b8290f3a69818aa9b7e';
      const passwordHash = `salt:${correctHash}`;
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'test@example.com', password: passwordHash } as any);
      const res = await request(app)
        .put('/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Current password is incorrect');
    });
  });

  describe('PUT /users/:userId/password (admin reset)', () => {
    const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

    beforeEach(() => {
      mockedPrisma.user.update.mockReset();
      mockedPrisma.programAssignment.findMany.mockReset();
      mockedPrisma.staff.findFirst.mockReset();
      mockedPrisma.delegate.findFirst.mockReset();
    });

    it('resets password for staff in admin program', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'staff@example.com' } as any);
      mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([{ programId: 'abc' }] as any);
      mockedPrisma.staff.findFirst.mockResolvedValueOnce({ id: 1, userId: 10 } as any);
      mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null as any);
      mockedPrisma.user.update.mockResolvedValueOnce({ id: 10 } as any);
      const res = await request(app)
        .put('/users/10/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password reset successfully');
    });

    it('resets password for delegate in admin program', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'delegate@example.com' } as any);
      mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([{ programId: 'abc' }] as any);
      mockedPrisma.staff.findFirst.mockResolvedValueOnce(null as any);
      mockedPrisma.delegate.findFirst.mockResolvedValueOnce({ id: 1, userId: 10 } as any);
      mockedPrisma.user.update.mockResolvedValueOnce({ id: 10 } as any);
      const res = await request(app)
        .put('/users/10/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Password reset successfully');
    });

    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .put('/users/10/password')
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(401);
    });

    it('returns 400 when password missing', async () => {
      const res = await request(app)
        .put('/users/10/password')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('New password required');
    });

    it('returns 400 when password too short', async () => {
      const res = await request(app)
        .put('/users/10/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'short' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('8 characters');
    });

    it('returns 400 for invalid user ID', async () => {
      const res = await request(app)
        .put('/users/invalid/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid user ID');
    });

    it('returns 404 when target user not found', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .put('/users/999/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('User not found');
    });

    it('returns 403 when admin has no access to target user', async () => {
      mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 10, email: 'other@example.com' } as any);
      mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([{ programId: 'abc' }] as any);
      mockedPrisma.staff.findFirst.mockResolvedValueOnce(null as any);
      mockedPrisma.delegate.findFirst.mockResolvedValueOnce(null as any);
      const res = await request(app)
        .put('/users/10/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ newPassword: 'newpassword123' });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });
  });
});
