import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';

const router = express.Router();

function buildTree(questions: any[]) {
  const byId: Record<number, any> = {};
  questions.forEach((q) => {
    byId[q.id] = { ...q, options: q.options.map((o: any) => o.value), fields: [] };
  });
  const roots: any[] = [];
  questions.forEach((q) => {
    if (q.parentId) {
      byId[q.parentId].fields.push(byId[q.id]);
    } else {
      roots.push(byId[q.id]);
    }
  });
  return roots.sort((a, b) => a.order - b.order);
}

async function saveQuestions(applicationId: string, items: any[], parentId?: number) {
  for (let i = 0; i < items.length; i++) {
    const q = items[i];
    const created = await prisma.applicationQuestion.create({
      data: {
        applicationId,
        parentId: parentId ?? null,
        order: i,
        type: q.type,
        text: q.text,
        required: q.required ?? null,
        accept: q.accept,
        maxFiles: q.maxFiles,
      },
    });
    if (Array.isArray(q.options)) {
      for (let j = 0; j < q.options.length; j++) {
        await prisma.applicationQuestionOption.create({
          data: { questionId: created.id, value: q.options[j], order: j },
        });
      }
    }
    if (Array.isArray(q.fields)) {
      await saveQuestions(applicationId, q.fields, created.id);
    }
  }
}

router.get('/api/programs/:programId/application', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const application = await prisma.application.findFirst({ where: { programId } });
  if (!application) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const questions = await prisma.applicationQuestion.findMany({
    where: { applicationId: application.id },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  const result = buildTree(questions);
  res.json({ applicationId: application.id, title: application.title, description: application.description, questions: result });
});

async function saveApplication(req: express.Request, res: express.Response) {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { title, description, questions } = req.body as any;
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  await prisma.applicationQuestionOption.deleteMany({
    where: { question: { application: { programId } } },
  });
  await prisma.applicationQuestion.deleteMany({
    where: { application: { programId } },
  });
  await prisma.application.deleteMany({ where: { programId } });
  const application = await prisma.application.create({ data: { programId, title, description } });
  await saveQuestions(application.id, questions || []);
  logger.info(programId, `Application saved by ${caller.email}`);
  res.status(201).json({ applicationId: application.id, title, description, questions });
}

router.post('/api/programs/:programId/application', saveApplication);
router.put('/api/programs/:programId/application', saveApplication);

router.delete('/api/programs/:programId/application', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await prisma.applicationQuestionOption.deleteMany({
    where: { question: { application: { programId } } },
  });
  await prisma.applicationQuestion.deleteMany({
    where: { application: { programId } },
  });
  await prisma.application.deleteMany({ where: { programId } });
  logger.info(programId, `Application deleted by ${caller.email}`);
  res.json({ status: 'deleted' });
});

router.post('/api/programs/:programId/application/responses', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const application = await prisma.application.findFirst({ where: { programId } });
  if (!application) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const body = req.body as { answers: { questionId: number; value: string }[] };
  if (!Array.isArray(body.answers)) {
    res.status(400).json({ error: 'answers required' });
    return;
  }
  const created = await prisma.applicationResponse.create({
    data: {
      applicationId: application.id,
      answers: { create: body.answers.map((a) => ({ questionId: a.questionId, value: a.value })) },
    },
  });
  logger.info(programId, `Application submitted ${created.id}`);
  res.status(201).json({ responseId: created.id });
});

router.get('/api/programs/:programId/application/responses', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const responses = await prisma.applicationResponse.findMany({
    where: { application: { programId } },
    include: { answers: true },
  });
  res.json(responses);
});

export default router;

