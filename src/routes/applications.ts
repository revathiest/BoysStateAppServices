import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';
import { Prisma } from '@prisma/client';

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
  const { year, type } = req.query as { year?: string; type?: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(204).end();
    return;
  }
  const application = await prisma.application.findFirst({
    where: {
      programId,
      ...(year ? { year: Number(year) } : {}),
      ...(type ? { type } : {}),
    },
    include: { responses: true },
  });
  if (!application) {
    res.status(204).end();
    return;
  }
  const questions = await prisma.applicationQuestion.findMany({
    where: { applicationId: application.id },
    orderBy: { order: 'asc' },
    include: { options: { orderBy: { order: 'asc' } } },
  });
  const result = buildTree(questions);

  // Check if questions are locked (application has responses)
  const responseCount = application.responses?.length || 0;
  const hasResponses = responseCount > 0;
  const responseText = responseCount === 1 ? '1 response' : `${responseCount} responses`;

  const responseData = {
    applicationId: application.id,
    title: application.title,
    description: application.description,
    year: application.year,
    type: application.type,
    closingDate: application.closingDate,
    questions: result,
    ...(hasResponses ? {
      locked: ['questions'],
      updated: ['title', 'description', 'closingDate'],
      message: `Questions are locked because ${responseText} have been submitted. You can update the title, description, and closing date, or delete all responses to unlock question editing.`
    } : {})
  };

  res.json(responseData);
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
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { title, description, questions, year, type, closingDate } = req.body as any;
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  if (year === undefined) {
    res.status(400).json({ error: 'year required' });
    return;
  }
  if (!type) {
    res.status(400).json({ error: 'type required' });
    return;
  }
  const yr = Number(year);
  const closingDateTime = closingDate ? new Date(closingDate) : null;

  // Check if application already exists
  const existingApp = await prisma.application.findFirst({
    where: { programId, year: yr, type },
    include: { responses: true },
  });

  if (existingApp) {
    // Application exists - update it
    // Questions are only locked if there are responses
    const responseCount = existingApp.responses?.length || 0;
    const hasResponses = responseCount > 0;
    const responseText = responseCount === 1 ? '1 response' : `${responseCount} responses`;

    // If no responses, allow question updates
    if (!hasResponses) {
      // Delete in order to respect foreign key constraints:
      // 1. Delete answers (references questions)
      await prisma.applicationAnswer.deleteMany({
        where: { question: { applicationId: existingApp.id } },
      });
      // 2. Delete question options
      await prisma.applicationQuestionOption.deleteMany({
        where: { question: { applicationId: existingApp.id } },
      });
      // 3. Delete questions
      await prisma.applicationQuestion.deleteMany({
        where: { applicationId: existingApp.id },
      });
      // 4. Save new questions
      await saveQuestions(existingApp.id, questions || []);
    }

    // Update metadata (always allowed)
    await prisma.application.update({
      where: { id: existingApp.id },
      data: { title, description, closingDate: closingDateTime },
    });

    logger.info(
      programId,
      `Application updated by ${caller.email} (${hasResponses ? `${responseText} preserved, questions locked` : 'questions updated'})`
    );

    res.status(200).json({
      applicationId: existingApp.id,
      title,
      description,
      year: yr,
      type,
      closingDate: closingDateTime,
      questions: !hasResponses ? questions : undefined,
      ...(hasResponses ? {
        updated: ['title', 'description', 'closingDate'],
        locked: ['questions'],
        message: `Application metadata updated successfully. Questions are locked because ${responseText} have been submitted. ${responseText} preserved.`
      } : {
        message: 'Application updated successfully.'
      })
    });
    return;
  }

  // No existing application - create new one with questions
  const application = await prisma.application.create({
    data: { programId, title, description, year: yr, type, closingDate: closingDateTime }
  });
  await saveQuestions(application.id, questions || []);
  logger.info(programId, `Application created by ${caller.email}`);
  res.status(201).json({
    applicationId: application.id,
    title,
    description,
    year: yr,
    type,
    closingDate: closingDateTime,
    questions,
    message: 'Application created successfully. Questions are now locked and cannot be modified.'
  });
}

router.post('/api/programs/:programId/application', saveApplication);
router.put('/api/programs/:programId/application', saveApplication);

router.delete('/api/programs/:programId/application', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const { year, type } = req.query as { year?: string; type?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (year === undefined || !type) {
    res.status(400).json({ error: 'year and type required' });
    return;
  }
  const yr = Number(year);
  await prisma.applicationQuestionOption.deleteMany({
    where: { question: { application: { programId, year: yr, type } } },
  });
  await prisma.applicationQuestion.deleteMany({
    where: { application: { programId, year: yr, type } },
  });
  await prisma.application.deleteMany({ where: { programId, year: yr, type } });
  logger.info(programId, `Application deleted by ${caller.email}`);
  res.json({ status: 'deleted' });
});

// Delete all responses for an application (to unlock question editing)
router.delete('/api/programs/:programId/application/responses/all', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const { year, type } = req.query as { year?: string; type?: string };
  const caller = (req as any).user as { userId: number; email: string };

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(204).end();
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (year === undefined || !type) {
    res.status(400).json({ error: 'year and type required' });
    return;
  }

  const yr = Number(year);

  // Find the application
  const application = await prisma.application.findFirst({
    where: { programId, year: yr, type },
    include: { responses: true },
  });

  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const responseCount = application.responses?.length || 0;

  // Delete all answers first (foreign key to responses)
  await prisma.applicationAnswer.deleteMany({
    where: { response: { applicationId: application.id } },
  });

  // Delete all responses
  await prisma.applicationResponse.deleteMany({
    where: { applicationId: application.id },
  });

  logger.info(
    programId,
    `All ${responseCount} responses deleted for ${type} application (year ${yr}) by ${caller.email}`
  );

  res.json({
    status: 'deleted',
    deletedCount: responseCount,
    message: `Successfully deleted ${responseCount} response${responseCount === 1 ? '' : 's'}. Questions can now be edited.`
  });
});

router.post('/api/programs/:programId/application/responses', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const { year, type } = req.query as { year?: string; type?: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(204).end();
    return;
  }
  const application = await prisma.application.findFirst({
    where: {
      programId,
      ...(year ? { year: Number(year) } : {}),
      ...(type ? { type } : {}),
    },
  });
  if (!application) {
    res.status(204).end();
    return;
  }
  // Check if application is closed
  if (application.closingDate && new Date() > new Date(application.closingDate)) {
    res.status(400).json({ error: 'Applications are closed' });
    return;
  }
  const body = req.body as {
    answers: Record<string, Prisma.InputJsonValue | undefined>[];
  };
  if (!Array.isArray(body.answers)) {
    res.status(400).json({ error: 'answers required' });
    return;
  }
  const created = await prisma.applicationResponse.create({
    data: {
      applicationId: application.id,
      answers: {
        create: body.answers.map((a) => {
          const { questionId, value, ...rest } = a as {
            questionId: number;
            value?: Prisma.InputJsonValue;
            [key: string]: Prisma.InputJsonValue | number | undefined;
          };
          const finalValue =
            value !== undefined ? value : Object.keys(rest).length ? (rest as Prisma.JsonObject) : null;
          return { questionId, value: finalValue };
        }) as Prisma.ApplicationAnswerUncheckedCreateWithoutResponseInput[],
      },
    },
  });
  logger.info(programId, `Application submitted ${created.id}`);
  res.status(201).json({ responseId: created.id });
});

router.get('/api/programs/:programId/application/responses', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const { year, type } = req.query as { year?: string; type?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(204).end();
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const responses = await prisma.applicationResponse.findMany({
    where: {
      application: {
        programId,
        ...(year ? { year: Number(year) } : {}),
        ...(type ? { type } : {}),
      },
    },
    include: { answers: true },
  });
  res.json(responses);
});

export default router;

