import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';
import { getUserPrograms } from '../src/index';

const mockedPrisma = prisma as any;

describe('GET /programs/:username', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findMany.mockReset();
    mockedPrisma.user.findUnique.mockReset();
  });

  it('returns programs for the user', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 1, email: 'jane.doe' });
    mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([
      { role: 'admin', program: { id: 'abc123', name: 'Boys State Texas' } },
      { role: 'counselor', program: { id: 'def456', name: 'Girls State Florida' } },
    ]);
    const token = sign({ userId: 1, email: 'jane.doe' }, 'development-secret');
    const res = await request(app)
      .get('/user-programs/jane.doe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      username: 'jane.doe',
      programs: [
        { programId: 'abc123', programName: 'Boys State Texas', role: 'admin' },
        { programId: 'def456', programName: 'Girls State Florida', role: 'counselor' },
      ],
    });
  });

  it('returns empty array when user has no programs', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ id: 2, email: 'jane.doe' });
    mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([]);
    const token = sign({ userId: 2, email: 'jane.doe' }, 'development-secret');
    const res = await request(app)
      .get('/user-programs/jane.doe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'jane.doe', programs: [] });
  });

  it('returns 404 when user does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    const token = sign({ userId: 1, email: 'jane.doe' }, 'development-secret');
    const res = await request(app)
      .get('/user-programs/missing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when username missing', async () => {
    const req: any = { params: {} };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    await getUserPrograms(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Username required' });
  });
});

describe('POST /programs', () => {
  beforeEach(() => {
    mockedPrisma.program.create.mockReset();
    mockedPrisma.programAssignment.create.mockReset();
  });

  it('creates a program and assigns admin role', async () => {
    mockedPrisma.program.create.mockResolvedValueOnce({
      id: 'prog1',
      name: 'Boys State 2025',
      year: 2025,
    });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});
    const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
    const res = await request(app)
      .post('/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Boys State 2025', year: 2025 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.program.create).toHaveBeenCalled();
    expect(mockedPrisma.programAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ programId: 'prog1', role: 'admin', userId: 1 }),
      }),
    );
  });

  it('requires name and year', async () => {
    const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
    const res = await request(app)
      .post('/programs')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Missing Year' });
    expect(res.status).toBe(400);
  });
});

describe('Program assignments', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
    mockedPrisma.programAssignment.create.mockReset();
    mockedPrisma.programAssignment.findMany.mockReset();
  });

  it('assigns user when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programAssignment.create.mockResolvedValueOnce({});
    const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
    const res = await request(app)
      .post('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 2, role: 'counselor' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programAssignment.create).toHaveBeenCalled();
  });

  it('rejects non-admin assignment', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'counselor' });
    const token = sign({ userId: 1, email: 'counselor@example.com' }, 'development-secret');
    const res = await request(app)
      .post('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: 2, role: 'delegate' });
    expect(res.status).toBe(403);
  });

  it('lists users in a program for admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programAssignment.findMany.mockResolvedValueOnce([
      { userId: 1, role: 'admin' },
      { userId: 2, role: 'delegate' },
    ]);
    const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
    const res = await request(app)
      .get('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('forbids listing for non-admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const token = sign({ userId: 2, email: 'delegate@example.com' }, 'development-secret');
    const res = await request(app)
      .get('/programs/abc/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('Program CRUD', () => {
  beforeEach(() => {
    mockedPrisma.program.findMany.mockReset();
    mockedPrisma.program.findUnique.mockReset();
    mockedPrisma.program.update.mockReset();
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

  it('lists programs', async () => {
    mockedPrisma.program.findMany.mockResolvedValueOnce([{ id: 'p1' }]);
    const res = await request(app).get('/programs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.program.findMany).toHaveBeenCalled();
  });

  it('gets program for member', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'p1' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const res = await request(app).get('/programs/p1').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('updates program when admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'p1' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.update.mockResolvedValueOnce({ id: 'p1', name: 'New' });
    const res = await request(app)
      .put('/programs/p1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.program.update).toHaveBeenCalled();
  });

  it('retires program', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'p1' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.program.update.mockResolvedValueOnce({ id: 'p1', status: 'retired' });
    const res = await request(app)
      .delete('/programs/p1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.program.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { status: 'retired' } });
  });
});
