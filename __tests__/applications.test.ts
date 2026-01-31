import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.program.findUnique.mockReset();
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.application.create.mockReset();
  mockedPrisma.application.findFirst.mockReset();
  mockedPrisma.application.update.mockReset();
  mockedPrisma.application.deleteMany.mockReset();
  mockedPrisma.applicationQuestion.create.mockReset();
  mockedPrisma.applicationQuestion.findMany.mockReset();
  mockedPrisma.applicationQuestion.deleteMany.mockReset();
  mockedPrisma.applicationQuestionOption.create.mockReset();
  mockedPrisma.applicationQuestionOption.deleteMany.mockReset();
  mockedPrisma.applicationAnswer.deleteMany.mockReset();
  mockedPrisma.applicationResponse.create.mockReset();
  mockedPrisma.applicationResponse.findMany.mockReset();
  mockedPrisma.applicationResponse.findUnique.mockReset();
  mockedPrisma.applicationResponse.deleteMany.mockReset();
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
      .send({ title: 'App', questions: [], year: 2024, type: 'delegate' });
    expect(res.status).toBe(201);
    expect(mockedPrisma.application.create).toHaveBeenCalled();
  });

  it('forbids non admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', year: 2024, type: 'delegate' });
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
      .send({ title: 'App', year: 2024, type: 'delegate' });
    expect(res.status).toBe(204);
  });
});

describe('PUT /api/programs/:id/application', () => {
  it('creates new application when none exists', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.application.create.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .put('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', questions: [], year: 2024, type: 'delegate' });

    expect(res.status).toBe(201);
    expect(mockedPrisma.application.create).toHaveBeenCalled();
  });

  it('updates existing application with no responses', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      programId: 'abc',
      year: 2024,
      type: 'delegate',
      responses: []
    });
    mockedPrisma.applicationAnswer.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.applicationQuestionOption.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.applicationQuestion.deleteMany.mockResolvedValueOnce({});
    mockedPrisma.application.update.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationQuestion.create.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .put('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated App', questions: [], year: 2024, type: 'delegate' });

    expect(res.status).toBe(200);
    expect(mockedPrisma.applicationAnswer.deleteMany).toHaveBeenCalled();
    expect(mockedPrisma.applicationQuestionOption.deleteMany).toHaveBeenCalled();
    expect(mockedPrisma.applicationQuestion.deleteMany).toHaveBeenCalled();
    expect(mockedPrisma.application.update).toHaveBeenCalled();
  });

  it('updates metadata only when application has responses', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      programId: 'abc',
      year: 2024,
      type: 'delegate',
      responses: [{ id: 'resp1' }]
    });
    mockedPrisma.application.update.mockResolvedValueOnce({ id: 'app1' });

    const res = await request(app)
      .put('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', questions: [], year: 2024, type: 'delegate' });

    expect(res.status).toBe(200);
    expect(mockedPrisma.application.update).toHaveBeenCalled();
    expect(mockedPrisma.applicationQuestion.deleteMany).not.toHaveBeenCalled();
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
      .delete('/api/programs/abc/application?year=2024&type=delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(mockedPrisma.application.deleteMany).toHaveBeenCalled();
  });

  it('forbids delete when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application?year=2024&type=delegate')
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
        year: 2024,
        type: 'delegate',
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
        year: 2024,
        type: 'delegate',
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
      .delete('/api/programs/abc/application?year=2024&type=delegate')
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

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/application/responses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns single response with responseId', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findUnique.mockResolvedValueOnce({
      id: 'resp1',
      createdAt: new Date('2025-01-15'),
      application: { programId: 'abc', year: 2025, type: 'delegate' },
      answers: [
        { question: { text: 'First Name', type: 'text' }, value: 'John' },
        { question: { text: 'Last Name', type: 'text' }, value: 'Doe' },
        { question: { text: 'Email', type: 'email' }, value: 'john@example.com' },
        { question: { text: 'Phone', type: 'tel' }, value: '555-1234' },
        { question: { text: 'School', type: 'text' }, value: 'Lincoln High' },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/application/responses?responseId=resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('resp1');
    expect(res.body.name).toBe('Doe, John');
    expect(res.body.email).toBe('john@example.com');
    expect(res.body.school).toBe('Lincoln High');
  });

  it('returns 404 when single response not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/programs/abc/application/responses?responseId=missing')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 when response belongs to different program', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findUnique.mockResolvedValueOnce({
      id: 'resp1',
      application: { programId: 'different', year: 2025, type: 'delegate' },
      answers: [],
    });
    const res = await request(app)
      .get('/api/programs/abc/application/responses?responseId=resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('formats list view with nested answers', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      {
        id: 'resp1',
        createdAt: new Date(),
        application: { programId: 'abc', year: 2025, type: 'staff' },
        answers: [
          { question: { text: 'First Name', type: 'text' }, value: 'Jane' },
          { question: { text: 'Last Name', type: 'text' }, value: 'Smith' },
          { question: { text: 'Email', type: 'email' }, value: 'jane@example.com' },
          { question: { text: 'Preferred Role', type: 'text' }, value: 'Counselor' },
        ],
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/application/responses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Smith, Jane');
    expect(res.body[0].role).toBe('Counselor');
  });

  it('handles Full Name field in responses', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findMany.mockResolvedValueOnce([
      {
        id: 'resp1',
        createdAt: new Date(),
        application: { programId: 'abc', year: 2025, type: 'delegate' },
        answers: [
          { question: { text: 'Full Name', type: 'text' }, value: 'Bob Wilson' },
        ],
      },
    ]);
    const res = await request(app)
      .get('/api/programs/abc/application/responses')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Bob Wilson');
  });

  it('handles object values with value property', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findUnique.mockResolvedValueOnce({
      id: 'resp1',
      createdAt: new Date(),
      application: { programId: 'abc', year: 2025, type: 'delegate' },
      answers: [
        { question: { text: 'First Name', type: 'text' }, value: { value: 'Tom' } },
        { question: { text: 'Last Name', type: 'text' }, value: { value: 'Jones' } },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/application/responses?responseId=resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Jones, Tom');
  });

  it('handles staff response with role and position fields', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.applicationResponse.findUnique.mockResolvedValueOnce({
      id: 'resp1',
      createdAt: new Date(),
      application: { programId: 'abc', year: 2025, type: 'staff' },
      answers: [
        { question: { text: 'First Name', type: 'text' }, value: 'Alice' },
        { question: { text: 'Last Name', type: 'text' }, value: 'Brown' },
        { question: { text: 'Desired Position', type: 'text' }, value: 'Director' },
      ],
    });
    const res = await request(app)
      .get('/api/programs/abc/application/responses?responseId=resp1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('Director');
  });
});

describe('POST /api/programs/:id/application validation', () => {
  it('returns 400 when year missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', type: 'delegate' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('year required');
  });

  it('returns 400 when type missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'App', year: 2024 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('type required');
  });
});

describe('DELETE /api/programs/:id/application validation', () => {
  it('returns 400 when year/type missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .delete('/api/programs/abc/application')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('year and type required');
  });
});

describe('DELETE /api/programs/:id/application/responses/all', () => {
  beforeEach(() => {
    mockedPrisma.applicationResponse.deleteMany?.mockReset?.();
  });

  it('deletes all responses for admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      responses: [{ id: 'r1' }, { id: 'r2' }],
    });
    mockedPrisma.applicationAnswer.deleteMany.mockResolvedValueOnce({ count: 5 });
    mockedPrisma.applicationResponse.deleteMany.mockResolvedValueOnce({ count: 2 });
    const res = await request(app)
      .delete('/api/programs/abc/application/responses/all?year=2024&type=delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deletedCount).toBe(2);
  });

  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application/responses/all?year=2024&type=delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('returns 403 when not admin', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application/responses/all?year=2024&type=delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when year/type missing', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .delete('/api/programs/abc/application/responses/all')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/api/programs/abc/application/responses/all?year=2024&type=delegate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/programs/:id/application/responses edge cases', () => {
  it('returns 204 when program not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({ answers: [] });
    expect(res.status).toBe(204);
  });

  it('returns 204 when application not found', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({ answers: [] });
    expect(res.status).toBe(204);
  });

  it('returns 400 when application is closed', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      closingDate: new Date('2020-01-01'),
    });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({ answers: [{ questionId: 1, value: 'test' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Applications are closed');
  });

  it('returns 400 when answers not an array', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1' });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({ answers: 'not an array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('answers required');
  });

  it('handles answer with no value (uses rest as value)', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({ id: 'app1' });
    mockedPrisma.applicationResponse.create.mockResolvedValueOnce({ id: 'resp1' });
    const res = await request(app)
      .post('/api/programs/abc/application/responses')
      .send({
        answers: [{ questionId: 1 }],
      });
    expect(res.status).toBe(201);
    const args = mockedPrisma.applicationResponse.create.mock.calls[0][0];
    expect(args.data.answers.create[0].value).toBeNull();
  });
});

describe('GET /api/programs/:id/application locked state', () => {
  it('returns locked message when responses exist', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      title: 'App',
      description: 'desc',
      year: 2024,
      type: 'delegate',
      responses: [{ id: 'r1' }, { id: 'r2' }],
    });
    mockedPrisma.applicationQuestion.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(200);
    expect(res.body.locked).toEqual(['questions']);
    expect(res.body.message).toContain('2 responses');
  });

  it('returns locked message for single response', async () => {
    mockedPrisma.program.findUnique.mockResolvedValueOnce({ id: 'abc' });
    mockedPrisma.application.findFirst.mockResolvedValueOnce({
      id: 'app1',
      title: 'App',
      description: 'desc',
      year: 2024,
      type: 'delegate',
      responses: [{ id: 'r1' }],
    });
    mockedPrisma.applicationQuestion.findMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/programs/abc/application');
    expect(res.status).toBe(200);
    expect(res.body.locked).toEqual(['questions']);
    expect(res.body.message).toContain('1 response');
  });
});

