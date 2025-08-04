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
  mockedPrisma.applicationResponse.create.mockReset();
  mockedPrisma.applicationResponse.findMany.mockReset();
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

  it('returns 204 when missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(204);
  });

  it('returns 204 when no application', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(204);
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

  it('returns 204 for invalid program', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App' });
    expect(res.status).toBe(204);
  });
});

describe('PUT /api/programs/:id/application', () => {
  it('replaces existing application when admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationQuestionOption.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.applicationQuestion.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.application.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.application.create.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .put('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', questions: [] });

    expect(res.status).toBe(201);
    expect(mockedPrisma.applicationQuestionOption.deleteMany).toHaveBeenCalled();
    expect(mockedPrisma.applicationQuestion.deleteMany).toHaveBeenCalled();
    expect(mockedPrisma.application.deleteMany).toHaveBeenCalled();
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

  it('saves and retrieves all question types including repeating groups', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.create.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 })
      .mockResolvedValueOnce({ id: 4 })
      .mockResolvedValueOnce({ id: 5 })
      .mockResolvedValueOnce({ id: 6 })
      .mockResolvedValueOnce({ id: 7 });
    mockedPrisma.applicationQuestionOption.create.mockResolvedValue({});

    const createRes = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'App',
        questions: [
          { type: 'text', text: 't1' },
          { type: 'essay', text: 't2' },
          { type: 'dropdown', text: 't3', options: ['a', 'b'] },
          { type: 'multi-choice', text: 't4', options: ['a', 'b', 'c'] },
          { type: 'file', text: 't5', accept: 'image/*', maxFiles: 1 },
          {
            type: 'repeating-group',
            text: 'group',
            fields: [{ type: 'text', text: 'child' }],
          },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(mockedPrisma.applicationQuestion.create).toHaveBeenCalledTimes(7);
    expect(mockedPrisma.applicationQuestionOption.create).toHaveBeenCalledTimes(5);
    const parentCall = mockedPrisma.applicationQuestion.create.mock.calls[5][0];
    const childCall = mockedPrisma.applicationQuestion.create.mock.calls[6][0];
    expect(parentCall.data.parentId).toBeNull();
    expect(childCall.data.parentId).toBe(6);

    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      programId: 'abc',
      title: 'App',
      description: 'desc',
    });
    mockedPrisma.applicationQuestion.findMany.mockResolvedValueOnce([
      { id: 1, parentId: null, order: 0, type: 'text', text: 't1', options: [] },
      { id: 2, parentId: null, order: 1, type: 'essay', text: 't2', options: [] },
      {
        id: 3,
        parentId: null,
        order: 2,
        type: 'dropdown',
        text: 't3',
        options: [
          { value: 'a', order: 0 },
          { value: 'b', order: 1 },
        ],
      },
      {
        id: 4,
        parentId: null,
        order: 3,
        type: 'multi-choice',
        text: 't4',
        options: [
          { value: 'a', order: 0 },
          { value: 'b', order: 1 },
          { value: 'c', order: 2 },
        ],
      },
      {
        id: 5,
        parentId: null,
        order: 4,
        type: 'file',
        text: 't5',
        accept: 'image/*',
        maxFiles: 1,
        options: [],
      },
      { id: 6, parentId: null, order: 5, type: 'repeating-group', text: 'group', options: [] },
      { id: 7, parentId: 6, order: 0, type: 'text', text: 'child', options: [] },
    ]);

    const getRes = await request(app).get('/api/programs/abc/application');
    expect(getRes.status).toBe(200);
    expect(getRes.body.questions.length).toBe(6);
    expect(getRes.body.questions[5].fields[0].id).toBe(7);
    expect(getRes.body.questions[2].options).toEqual(['a', 'b']);
  });

  it('returns 204 on delete when program missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

describe('POST /api/programs/:id/application/responses', () => {
  it('accepts public submission', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationResponse.create.mockResolvedValueOnce({ id: 'resp1' });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({ answers: [{ questionId: 1, value: 'John' }] });
    expect(res.status).toBe(201);
    expect(mockedPrisma.applicationResponse.create).toHaveBeenCalled();
  });

  it('supports array and object answers', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationResponse.create.mockResolvedValueOnce({ id: 'resp1' });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({
        answers: [
          { questionId: 1, value: ['a', 'b'] },
          { questionId: 2, value: { start: '2025-01-01', end: '2025-01-02' } },
        ],
      });
    expect(res.status).toBe(201);
    expect(mockedPrisma.applicationResponse.create).toHaveBeenCalled();
    const args = mockedPrisma.applicationResponse.create.mock.calls[0][0];
    expect(args.data.answers.create[0].value).toEqual(['a', 'b']);
    expect(args.data.answers.create[1].value).toEqual({ start: '2025-01-01', end: '2025-01-02' });
  });

  it('maps extra fields to a value object', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationResponse.create.mockResolvedValueOnce({ id: 'resp1' });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({
        answers: [
          {
            questionId: 1,
            street: '123 Main',
            city: 'Austin',
            state: 'TX',
          },
        ],
      });
    expect(res.status).toBe(201);
    const args = mockedPrisma.applicationResponse.create.mock.calls[0][0];
    expect(args.data.answers.create[0].value).toEqual({
      street: '123 Main',
      city: 'Austin',
      state: 'TX',
    });
  });
});

describe('GET /api/programs/:id/application/responses', () => {
  it('requires admin access', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/application/responses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns responses for admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      { id: 'resp1', answers: [{ questionId: 1, value: 'John' }] },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/application/responses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe('resp1');
  });
});

