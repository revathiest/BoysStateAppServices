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

    const whereClause = {
      status: status as string,
      application: {
        programId,
        type: appType,
        ...(year ? { year: Number(year) } : {}),
      },
    };

    const responses = await prisma.applicationResponse.findMany({
      where: whereClause,
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

// Helper to extract answer value from application answers
// First tries exact match, then falls back to partial match (contains)
function extractAnswerValue(
  answers: Array<{ question: { text: string }; value: any }>,
  ...fieldNames: string[]
): string {
  // First try exact match (case-insensitive)
  for (const fieldName of fieldNames) {
    const answer = answers.find(
      (a) => a.question.text.toLowerCase() === fieldName.toLowerCase()
    );
    if (answer?.value) {
      return typeof answer.value === 'string'
        ? answer.value
        : answer.value?.toString() || '';
    }
  }
  // Fallback: try partial match (field name contains the search term)
  for (const fieldName of fieldNames) {
    const answer = answers.find(
      (a) => a.question.text.toLowerCase().includes(fieldName.toLowerCase())
    );
    if (answer?.value) {
      return typeof answer.value === 'string'
        ? answer.value
        : answer.value?.toString() || '';
    }
  }
  return '';
}

function decisionHandler(decision: 'accept' | 'reject') {
  return async (req: express.Request, res: express.Response) => {
    const { programId, type, applicationId } = req.params as {
      programId: string;
      type: string;
      applicationId: string;
    };
    const caller = (req as any).user as { userId: number; email: string };
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

    // Include answers for extracting applicant info when accepting
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
    if (response.status !== 'pending') {
      res.status(400).json({ error: 'Already decided' });
      return;
    }

    // For staff acceptance, require role in request body
    const { role, comment, reason } = req.body as {
      role?: string;
      comment?: string;
      reason?: string;
    };

    if (decision === 'accept' && type === 'staff' && !role) {
      res.status(400).json({ error: 'Role is required when accepting staff applications' });
      return;
    }

    // If accepting, create the Delegate or Staff record
    let createdRecordId: number | null = null;
    if (decision === 'accept') {
      // Extract applicant info from answers
      const firstName = extractAnswerValue(response.answers, 'First Name');
      const lastName = extractAnswerValue(response.answers, 'Last Name');
      const email = extractAnswerValue(response.answers, 'Email', 'Email Address');
      const phone = extractAnswerValue(response.answers, 'Phone', 'Phone Number');

      if (!firstName || !lastName || !email) {
        res.status(400).json({
          error: 'Application is missing required fields (First Name, Last Name, Email)',
        });
        return;
      }

      // Find or create the ProgramYear for this application
      const applicationYear = response.application.year;
      if (!applicationYear) {
        res.status(400).json({ error: 'Application has no year specified' });
        return;
      }

      let programYear = await prisma.programYear.findFirst({
        where: { programId, year: applicationYear },
      });

      if (!programYear) {
        // Create the program year if it doesn't exist
        programYear = await prisma.programYear.create({
          data: {
            programId,
            year: applicationYear,
            status: 'active',
          },
        });
        logger.info(programId, `Auto-created program year ${applicationYear} for application acceptance`);
      }

      if (type === 'delegate') {
        // Create delegate with no grouping assignment (for random assignment later)
        const delegate = await prisma.delegate.create({
          data: {
            programYearId: programYear.id,
            firstName,
            lastName,
            email,
            phone: phone || null,
            status: 'pending_assignment',
          },
        });
        createdRecordId = delegate.id;
        logger.info(programId, `Created delegate "${firstName} ${lastName}" (id: ${delegate.id}) from application by ${caller.email}`);
      } else {
        // Create staff with the provided role
        const staff = await prisma.staff.create({
          data: {
            programYearId: programYear.id,
            firstName,
            lastName,
            email,
            phone: phone || null,
            role: role!,
            status: 'active',
          },
        });
        createdRecordId = staff.id;
        logger.info(programId, `Created staff "${firstName} ${lastName}" as ${role} (id: ${staff.id}) from application by ${caller.email}`);
      }
    }

    // Update application status
    await prisma.applicationResponse.update({
      where: { id: applicationId },
      data: { status: decision === 'accept' ? 'accepted' : 'rejected' },
    });

    const auditComment = comment || reason;
    await prisma.auditLog.create({
      data: {
        tableName: 'ApplicationResponse',
        recordId: applicationId,
        userId: caller.userId,
        action: decision,
        changes: {
          ...(auditComment ? { comment: auditComment } : {}),
          ...(createdRecordId ? { createdRecordId, recordType: type } : {}),
        },
      },
    });
    const applicantName = extractAnswerValue(response.answers, 'First Name') + ' ' + extractAnswerValue(response.answers, 'Last Name');
    logger.info(programId, `${decision === 'accept' ? 'Accepted' : 'Rejected'} ${type} application from "${applicantName.trim()}" by ${caller.email}`);

    res.json({
      success: true,
      ...(createdRecordId ? { [`${type}Id`]: createdRecordId } : {}),
    });
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

