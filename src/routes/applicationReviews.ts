import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';

const router = express.Router();

function listHandler(appType: string) {
  return async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId: string };
    const { status = 'pending', year } = req.query as {
      status?: string;
      year?: string;
    };
    const caller = (req as any).user as { userId: number };

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
        status: status as string,
        application: {
          programId,
          type: appType,
          ...(year ? { year: Number(year) } : {}),
        },
      },
      include: {
        application: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });

    // Transform responses to include year and extract name/role from answers
    const transformedResponses = responses.map((response) => {
      // Find first name and last name fields (should always be first two questions)
      const firstNameAnswer = response.answers.find(
        (a) => a.question.text === 'First Name' || a.question.text.toLowerCase() === 'first name'
      );
      const lastNameAnswer = response.answers.find(
        (a) => a.question.text === 'Last Name' || a.question.text.toLowerCase() === 'last name'
      );

      const firstName = firstNameAnswer?.value
        ? typeof firstNameAnswer.value === 'string'
          ? firstNameAnswer.value
          : (firstNameAnswer.value as any)?.toString() || ''
        : '';
      const lastName = lastNameAnswer?.value
        ? typeof lastNameAnswer.value === 'string'
          ? lastNameAnswer.value
          : (lastNameAnswer.value as any)?.toString() || ''
        : '';

      // Combine first and last name
      const name = `${firstName} ${lastName}`.trim() ||
        // Fallback to old "Full Name" field for legacy applications
        response.answers.find(a => a.question.text === 'Full Name' || a.question.text.toLowerCase().includes('full name'))?.value?.toString() || '';

      // Find role field (for staff applications)
      const roleAnswer = response.answers.find(
        (a) =>
          a.question.text.toLowerCase().includes('role') ||
          a.question.text.toLowerCase().includes('position')
      );
      const role = roleAnswer?.value
        ? typeof roleAnswer.value === 'string'
          ? roleAnswer.value
          : (roleAnswer.value as any)?.toString() || ''
        : '';

      return {
        id: response.id,
        name,
        fullName: name,
        role: appType === 'staff' ? role : undefined,
        year: response.application.year,
        status: response.status,
        submittedAt: response.createdAt,
      };
    });

    res.json(transformedResponses);
  };
}

router.get(
  '/api/programs/:programId/applications/delegate',
  listHandler('delegate'),
);
router.get(
  '/api/programs/:programId/applications/staff',
  listHandler('staff'),
);

router.get(
  '/api/programs/:programId/applications/:type/:applicationId',
  async (req: express.Request, res: express.Response) => {
    const { programId, type, applicationId } = req.params as {
      programId: string;
      type: string;
      applicationId: string;
    };
    const caller = (req as any).user as { userId: number };
    if (!['delegate', 'staff'].includes(type)) {
      res.status(400).json({ error: 'Invalid type' });
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

    const response = await prisma.applicationResponse.findFirst({
      where: { id: applicationId, application: { programId, type } },
      include: {
        application: true,
        answers: {
          include: {
            question: true,
          },
        },
      },
    });
    if (!response) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    // Transform answers into a more usable format
    const formattedAnswers = response.answers.map((answer) => ({
      questionId: answer.questionId,
      label: answer.question.text,
      type: answer.question.type,
      value: answer.value,
      answer: answer.value,
    }));

    // Extract name and role for convenience
    // Name should be First Name + Last Name (first two questions)
    const firstNameAnswer = response.answers.find(
      (a) => a.question.text === 'First Name' || a.question.text.toLowerCase() === 'first name'
    );
    const lastNameAnswer = response.answers.find(
      (a) => a.question.text === 'Last Name' || a.question.text.toLowerCase() === 'last name'
    );

    const firstName = firstNameAnswer?.value
      ? typeof firstNameAnswer.value === 'string'
        ? firstNameAnswer.value
        : (firstNameAnswer.value as any)?.toString() || ''
      : '';
    const lastName = lastNameAnswer?.value
      ? typeof lastNameAnswer.value === 'string'
        ? lastNameAnswer.value
        : (lastNameAnswer.value as any)?.toString() || ''
      : '';

    // Combine first and last name
    const name = `${firstName} ${lastName}`.trim() ||
      // Fallback to old "Full Name" field for legacy applications
      response.answers.find(a => a.question.text === 'Full Name' || a.question.text.toLowerCase().includes('full name'))?.value?.toString() || '';

    const roleAnswer = response.answers.find(
      (a) =>
        a.question.text.toLowerCase().includes('role') ||
        a.question.text.toLowerCase().includes('position')
    );
    const role = roleAnswer?.value
      ? typeof roleAnswer.value === 'string'
        ? roleAnswer.value
        : (roleAnswer.value as any)?.toString() || ''
      : '';

    res.json({
      id: response.id,
      name,
      fullName: name,
      role: type === 'staff' ? role : undefined,
      year: response.application.year,
      status: response.status,
      submittedAt: response.createdAt,
      answers: formattedAnswers,
    });
  },
);

function decisionHandler(decision: 'accept' | 'reject') {
  return async (req: express.Request, res: express.Response) => {
    const { programId, type, applicationId } = req.params as {
      programId: string;
      type: string;
      applicationId: string;
    };
    const caller = (req as any).user as { userId: number };
    if (!['delegate', 'staff'].includes(type)) {
      res.status(400).json({ error: 'Invalid type' });
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

    const response = await prisma.applicationResponse.findFirst({
      where: { id: applicationId, application: { programId, type } },
    });
    if (!response) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (response.status !== 'pending') {
      res.status(400).json({ error: 'Already decided' });
      return;
    }

    await prisma.applicationResponse.update({
      where: { id: applicationId },
      data: { status: decision === 'accept' ? 'accepted' : 'rejected' },
    });

    const comment = (req.body as any)?.comment || (req.body as any)?.reason;
    await prisma.auditLog.create({
      data: {
        tableName: 'ApplicationResponse',
        recordId: applicationId,
        userId: caller.userId,
        action: decision,
        ...(comment ? { changes: { comment } } : {}),
      },
    });
    logger.info(
      programId,
      `Application ${applicationId} ${decision}ed by ${caller.userId}`,
    );

    res.json({ success: true });
  };
}

router.post(
  '/api/programs/:programId/applications/:type/:applicationId/accept',
  decisionHandler('accept'),
);
router.post(
  '/api/programs/:programId/applications/:type/:applicationId/reject',
  decisionHandler('reject'),
);

export default router;

