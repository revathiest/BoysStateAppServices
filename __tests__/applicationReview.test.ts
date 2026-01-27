import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');
const mockedPrisma = prisma as any;

beforeEach(() => {
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.applicationResponse.findMany.mockReset();
  mockedPrisma.applicationResponse.findFirst.mockReset();
  mockedPrisma.applicationResponse.update.mockReset();
  mockedPrisma.auditLog.create.mockReset();
});

describe('GET /api/programs/:id/applications/delegate', () => {
  it('returns list for admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      {
        id: 'app1',
        status: 'pending',
        createdAt: new Date(),
        application: { year: 2025 },
        answers: [
          { question: { text: 'First Name' }, value: 'John' },
          { question: { text: 'Last Name' }, value: 'Doe' },
        ],
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('John Doe');
    expect(res.body[0].year).toBe(2025);
  });

  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('filters by status query parameter', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate?status=accepted')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'accepted',
        }),
      })
    );
  });

  it('filters by year query parameter', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([]);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate?year=2024')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          application: expect.objectContaining({
            year: 2024,
          }),
        }),
      })
    );
  });

  it('handles legacy Full Name field', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      {
        id: 'app1',
        status: 'pending',
        createdAt: new Date(),
        application: { year: 2025 },
        answers: [
          { question: { text: 'Full Name' }, value: 'Jane Smith' },
        ],
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Jane Smith');
  });
});

describe('GET /api/programs/:id/applications/staff', () => {
  it('returns list for admin with role field', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      {
        id: 'app1',
        status: 'pending',
        createdAt: new Date(),
        application: { year: 2025 },
        answers: [
          { question: { text: 'First Name' }, value: 'Alice' },
          { question: { text: 'Last Name' }, value: 'Johnson' },
          { question: { text: 'Preferred Role' }, value: 'Counselor' },
        ],
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/applications/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Alice Johnson');
    expect(res.body[0].role).toBe('Counselor');
  });

  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/staff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/programs/:id/applications/:type/:applicationId', () => {
  it('returns single application detail for admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({
      id: 'resp1',
      status: 'pending',
      createdAt: new Date('2025-01-15'),
      application: { year: 2025 },
      answers: [
        { questionId: 'q1', question: { text: 'First Name', type: 'text' }, value: 'John' },
        { questionId: 'q2', question: { text: 'Last Name', type: 'text' }, value: 'Doe' },
        { questionId: 'q3', question: { text: 'Email', type: 'email' }, value: 'john@example.com' },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('resp1');
    expect(res.body.name).toBe('John Doe');
    expect(res.body.fullName).toBe('John Doe');
    expect(res.body.year).toBe(2025);
    expect(res.body.status).toBe('pending');
    expect(res.body.answers).toHaveLength(3);
    expect(res.body.answers[0]).toEqual({
      questionId: 'q1',
      label: 'First Name',
      type: 'text',
      value: 'John',
      answer: 'John',
    });
  });

  it('returns staff application with role field', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({
      id: 'resp2',
      status: 'accepted',
      createdAt: new Date(),
      application: { year: 2025 },
      answers: [
        { questionId: 'q1', question: { text: 'First Name', type: 'text' }, value: 'Alice' },
        { questionId: 'q2', question: { text: 'Last Name', type: 'text' }, value: 'Smith' },
        { questionId: 'q3', question: { text: 'Desired Role', type: 'text' }, value: 'Director' },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/applications/staff/resp2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Director');
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(app)
      .get('/api/programs/abc/applications/invalid/resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid type');
  });

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when application not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  it('handles legacy Full Name field in detail view', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({
      id: 'resp3',
      status: 'pending',
      createdAt: new Date(),
      application: { year: 2024 },
      answers: [
        { questionId: 'q1', question: { text: 'Full Name', type: 'text' }, value: 'Bob Wilson' },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Bob Wilson');
  });

  it('handles non-string answer values', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({
      id: 'resp4',
      status: 'pending',
      createdAt: new Date(),
      application: { year: 2025 },
      answers: [
        { questionId: 'q1', question: { text: 'First Name', type: 'text' }, value: { toString: () => 'Tom' } },
        { questionId: 'q2', question: { text: 'Last Name', type: 'text' }, value: { toString: () => 'Brown' } },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/applications/delegate/resp4')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tom Brown');
  });
});

describe('POST accept application', () => {
  it('accepts pending application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'ok' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.update).toHaveBeenCalledWith({
      where: { id: 'resp1' },
      data: { status: 'accepted' },
    });
  });

  it('rejects already decided', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'accepted' });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('forbids accept when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid type parameter', async () => {
    const res = await request(app)
      .post('/api/programs/abc/applications/invalid/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid type');
  });

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('creates audit log with comment', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/accept')
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'Looks good!' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'accept',
        userId: 1,
        changes: { comment: 'Looks good!' },
      }),
    });
  });

  it('works with staff applications', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/staff/resp1/accept')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST reject application', () => {
  it('rejects pending application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'no' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationResponse.update).toHaveBeenCalledWith({
      where: { id: 'resp1' },
      data: { status: 'rejected' },
    });
  });

  it('returns 404 when application missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid type parameter', async () => {
    const res = await request(app)
      .post('/api/programs/abc/applications/invalid/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid type');
  });

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('creates audit log with reason', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Incomplete application' });
    expect(res.status).toBe(200);
    expect(mockedPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'reject',
        userId: 1,
        changes: { comment: 'Incomplete application' },
      }),
    });
  });

  it('forbids reject when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/applications/delegate/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('works with staff applications', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findFirst.mockResolvedValueOnce({ id: 'resp1', status: 'pending' });
    mockedPrisma.applicationResponse.update.mockResolvedValueOnce({ id: 'resp1' });
    mockedPrisma.auditLog.create.mockResolvedValueOnce({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/applications/staff/resp1/reject')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

