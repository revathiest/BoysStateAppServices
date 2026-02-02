import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.position.create.mockReset();
  mockedPrisma.position.findMany.mockReset();
  mockedPrisma.position.findUnique.mockReset();
  mockedPrisma.position.update.mockReset();
  mockedPrisma.programYear.findUnique.mockReset();
  mockedPrisma.programYearPosition.create.mockReset();
  mockedPrisma.programYearPosition.findMany.mockReset();
});

describe('Position endpoints', () => {
  it('creates position when admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Governor' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Governor' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.position.create).toHaveBeenCalled();
  });

  it('lists positions for member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.position.findMany.mockResolvedValueOnce([{ id: 1, programId: 'abc', name: 'Governor' }]);
    const res = await request(app)
      .get('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });

  it('updates position when admin', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({ id: 1, programId: 'abc', name: 'Updated' });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalled();
  });

  it('retires position', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({ id: 1, programId: 'abc', status: 'retired' });
    const res = await request(app)
      .delete('/positions/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'retired' } });
  });

  it('assigns position for a program year', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, isElected: true });
    mockedPrisma.programYearPosition.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ positionId: 1 });
    expect(res.status).toBe(201);
    expect(mockedPrisma.programYearPosition.create).toHaveBeenCalled();
  });

  it('lists program year positions for member', async () => {
    mockedPrisma.programYear.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc', year: 2025 });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    mockedPrisma.programYearPosition.findMany.mockResolvedValueOnce([{ id: 1, positionId: 1 }]);
    const res = await request(app)
      .get('/program-years/1/positions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
  });
});

describe('POST /programs/:programId/positions - validation', () => {
  it('returns 400 when name missing', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name required');
  });

  it('returns 400 for invalid electionMethod', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Governor', electionMethod: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid electionMethod');
  });

  it('creates elected position with all fields', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      name: 'Governor',
      isElected: true,
      isNonPartisan: true,
      seatCount: 1,
      requiresDeclaration: true,
      requiresPetition: true,
      petitionSignatures: 50,
      electionMethod: 'majority',
    });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Governor',
        groupingTypeId: 1,
        isElected: true,
        isNonPartisan: true,
        requiresDeclaration: true,
        requiresPetition: true,
        petitionSignatures: 50,
        electionMethod: 'majority',
      });
    expect(res.status).toBe(201);
    expect(mockedPrisma.position.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isElected: true,
          isNonPartisan: true,
          requiresDeclaration: true,
          requiresPetition: true,
          petitionSignatures: 50,
          electionMethod: 'majority',
        }),
      })
    );
  });

  it('creates non-elected position (clears election fields)', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      name: 'Committee Chair',
      isElected: false,
    });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Committee Chair',
        isElected: false,
        requiresDeclaration: true, // Should be ignored
        electionMethod: 'majority', // Should be ignored
      });
    expect(res.status).toBe(201);
    expect(mockedPrisma.position.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isElected: false,
          isNonPartisan: false,
          requiresDeclaration: false,
          requiresPetition: false,
          petitionSignatures: null,
          electionMethod: null,
        }),
      })
    );
  });

  it('creates elected position with ranked choice voting', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      name: 'President',
      electionMethod: 'ranked',
    });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'President', isElected: true, electionMethod: 'ranked' });
    expect(res.status).toBe(201);
  });

  it('creates elected position with plurality voting', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.create.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      name: 'Mayor',
      electionMethod: 'plurality',
    });
    const res = await request(app)
      .post('/programs/abc/positions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Mayor', isElected: true, electionMethod: 'plurality' });
    expect(res.status).toBe(201);
  });
});

describe('PUT /positions/:id - validation', () => {
  it('returns 400 for invalid electionMethod', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({ id: 1, programId: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ electionMethod: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid electionMethod');
  });

  it('updates to elected position with method', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      groupingTypeId: 1,
      electionMethod: null,
    });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({
      id: 1,
      isElected: true,
      electionMethod: 'majority',
    });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isElected: true, electionMethod: 'majority', requiresDeclaration: true });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isElected: true,
          electionMethod: 'majority',
          requiresDeclaration: true,
        }),
      })
    );
  });

  it('updates to non-elected position (clears election fields)', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      groupingTypeId: 1,
      electionMethod: 'majority',
    });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({
      id: 1,
      isElected: false,
      electionMethod: null,
    });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isElected: false });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isElected: false,
          electionMethod: null,
          isNonPartisan: false,
          requiresDeclaration: false,
          requiresPetition: false,
        }),
      })
    );
  });

  it('clears electionMethod by setting to null', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      groupingTypeId: 1,
      electionMethod: 'majority',
    });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({
      id: 1,
      isElected: true,
      electionMethod: null,
    });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isElected: true, electionMethod: null });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          electionMethod: null,
        }),
      })
    );
  });

  it('updates position with ballotGroupingTypeId', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      groupingTypeId: 1,
    });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({
      id: 1,
      isElected: true,
      ballotGroupingTypeId: 2,
    });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isElected: true, ballotGroupingTypeId: 2 });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ballotGroupingTypeId: 2,
        }),
      })
    );
  });

  it('updates petition requirements', async () => {
    mockedPrisma.position.findUnique.mockResolvedValueOnce({
      id: 1,
      programId: 'abc',
      groupingTypeId: 1,
    });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.position.update.mockResolvedValueOnce({
      id: 1,
      isElected: true,
      requiresPetition: true,
      petitionSignatures: 100,
    });
    const res = await request(app)
      .put('/positions/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ isElected: true, requiresPetition: true, petitionSignatures: 100 });
    expect(res.status).toBe(200);
    expect(mockedPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requiresPetition: true,
          petitionSignatures: 100,
        }),
      })
    );
  });
});
