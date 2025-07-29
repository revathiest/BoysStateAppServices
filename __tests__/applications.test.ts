import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret');

beforeEach(() => {
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.application.create.mockReset();
  mockedPrisma.application.findFirst.mockReset();
  mockedPrisma.application.deleteMany.mockReset();
  mockedPrisma.applicationQuestion.create.mockReset();
  mockedPrisma.applicationQuestion.findMany.mockReset();
  mockedPrisma.applicationQuestion.deleteMany.mockReset();
  mockedPrisma.applicationQuestionOption.create.mockReset();
  mockedPrisma.applicationQuestionOption.deleteMany.mockReset();
});

describe('GET /api/programs/:id/application', () => {
  it('is public and returns config', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1', programId: 'abc', title: 'App', description: '' });
    mockedPrisma.applicationQuestion.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(200);
    expect(mockedPrisma.application.findFirst).toHaveBeenCalled();
  });

  it('returns 404 when missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(404);
  });

  it('returns 404 when no application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/programs/:id/application', () => {
  it('creates when admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.create.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create.mockResolvedValue({ id: 1 });
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', questions: [] });
    expect(res.status).toBe(201);
    expect(mockedPrisma.application.create).toHaveBeenCalled();
  });

  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for invalid program', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/programs/:id/application', () => {
  it('deletes when admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.applicationQuestion.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.applicationQuestionOption.deleteMany.mockResolvedValueOnce({});
    const res = await request(app)
      .delete('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.application.deleteMany).toHaveBeenCalled();
  });

  it('forbids delete when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('additional coverage for application routes', () => {
  it('builds nested question tree on GET', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      programId: 'abc',
      title: 'App',
      description: 'desc',
    });
    mockedPrisma.applicationQuestion.findMany.mockResolvedValueOnce([
      {
        id: 10,
        parentId: null,
        order: 0,
        type: 'text',
        text: 'q1',
        options: [{ value: 'a', order: 0 }],
      },
      {
        id: 11,
        parentId: 10,
        order: 0,
        type: 'text',
        text: 'child',
        options: [],
      },
    ]);

    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(200);
    expect(res.body.questions[0].fields[0].id).toBe(11);
    expect(res.body.questions[0].options).toEqual(['a']);
  });

  it('creates nested questions with options', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.create.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create
      .mockResolvedValueOnce({ id: 100 })
      .mockResolvedValueOnce({ id: 200 });
    mockedPrisma.applicationQuestionOption.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'App',
        questions: [
          {
            type: 'radio',
            text: 'q1',
            options: ['a', 'b'],
            fields: [{ type: 'text', text: 'child' }],
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(mockedPrisma.applicationQuestion.create).toHaveBeenCalledTimes(2);
    expect(mockedPrisma.applicationQuestionOption.create).toHaveBeenCalledTimes(2);
    const firstCall = mockedPrisma.applicationQuestion.create.mock.calls[0][0];
    const secondCall = mockedPrisma.applicationQuestion.create.mock.calls[1][0];
    expect(firstCall.data.parentId).toBeNull();
    expect(secondCall.data.parentId).toBe(100);
  });

  it('returns 404 on delete when program missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

