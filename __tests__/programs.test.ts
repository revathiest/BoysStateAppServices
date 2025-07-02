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
      .get('/programs/jane.doe')
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
      .get('/programs/jane.doe')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: 'jane.doe', programs: [] });
  });

  it('returns 404 when user does not exist', async () => {
    mockedPrisma.user.findUnique.mockResolvedValueOnce(null);
    const token = sign({ userId: 1, email: 'jane.doe' }, 'development-secret');
    const res = await request(app)
      .get('/programs/missing')
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
