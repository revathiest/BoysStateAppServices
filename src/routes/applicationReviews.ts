import express from 'express';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';
import { sendAcceptanceEmail } from '../email';

const scrypt = promisify(_scrypt);
const router = express.Router();

// Generate a random temporary password
function generateTempPassword(): string {
  return randomBytes(12).toString('base64').replace(/[+/=]/g, 'x');
}

// Hash a password using scrypt (same as auth.ts)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

// Create or find a user account for the applicant
async function createUserAccount(
  email: string,
  programId: string,
  role: 'delegate' | 'staff',
  staffRole?: string,
): Promise<{ userId: number; isNew: boolean; tempPassword?: string }> {
  logger.info(programId, `[USER ACCOUNT] Looking up user by email: "${email}"`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    logger.info(programId, `[USER ACCOUNT] Found existing user: id=${existingUser.id}, email="${existingUser.email}"`);

    // User exists - check if they already have a program assignment
    const existingAssignment = await prisma.programAssignment.findFirst({
      where: { userId: existingUser.id, programId },
    });

    // For staff, ensure they have a program assignment for web portal access
    if (role === 'staff' && !existingAssignment) {
      await prisma.programAssignment.create({
        data: {
          userId: existingUser.id,
          programId,
          role: staffRole || 'staff',
        },
      });
    }

    logger.info(programId, `[USER ACCOUNT] Returning existing user (isNew=false, NO tempPassword)`);
    return { userId: existingUser.id, isNew: false };
  }

  logger.info(programId, `[USER ACCOUNT] No existing user found, creating new user...`);

  // Create new user with temporary password
  const tempPassword = generateTempPassword();
  const hashedPassword = await hashPassword(tempPassword);

  const newUser = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
  });

  logger.info(programId, `[USER ACCOUNT] Created new user: id=${newUser.id}, tempPassword generated`);

  // For staff, create a program assignment for web portal access
  // Delegates don't get a program assignment (mobile app only)
  if (role === 'staff') {
    await prisma.programAssignment.create({
      data: {
        userId: newUser.id,
        programId,
        role: staffRole || 'staff',
      },
    });
    logger.info(programId, `[USER ACCOUNT] Created program assignment for staff`);
  }

  logger.info(programId, `[USER ACCOUNT] Returning new user (isNew=true, tempPassword="${tempPassword.substring(0, 4)}****")`);
  return { userId: newUser.id, isNew: true, tempPassword };
}

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

    try {
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
    const { role, comment, reason } = (req.body || {}) as {
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
    let userAccountInfo: { userId: number; isNew: boolean; tempPassword?: string } | null = null;

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
      logger.info(programId, `Application year: ${applicationYear}, Application ID: ${response.application.id}`);
      if (!applicationYear) {
        logger.error(programId, 'Application has no year specified');
        res.status(400).json({ error: 'Application has no year specified' });
        return;
      }

      let programYear = await prisma.programYear.findFirst({
        where: { programId, year: applicationYear },
      });
      logger.info(programId, `Found existing programYear: ${programYear ? `id=${programYear.id}` : 'none'}`);

      if (!programYear) {
        // Create the program year if it doesn't exist
        programYear = await prisma.programYear.create({
          data: {
            programId,
            year: applicationYear,
            status: 'active',
          },
        });
        logger.info(programId, `Auto-created program year ${applicationYear} (id: ${programYear.id}) for application acceptance`);
      } else {
        logger.info(programId, `Using existing program year ${applicationYear} (id: ${programYear.id})`);
      }

      if (type === 'delegate') {
        // Create user account for mobile app access (no web portal)
        userAccountInfo = await createUserAccount(email, programId, 'delegate');

        // Create delegate with no grouping assignment (for random assignment later)
        const delegate = await prisma.delegate.create({
          data: {
            programYearId: programYear.id,
            firstName,
            lastName,
            email,
            phone: phone || null,
            userId: userAccountInfo.userId,
            status: 'pending_assignment',
          },
        });
        createdRecordId = delegate.id;
        logger.info(programId, `Created delegate "${firstName} ${lastName}" (id: ${delegate.id}, userId: ${userAccountInfo.userId}) from application by ${caller.email}`);
      } else {
        // Create staff with the provided role
        // Create user account for web portal access
        userAccountInfo = await createUserAccount(email, programId, 'staff', role);

        try {
          const staff = await prisma.staff.create({
            data: {
              programYearId: programYear.id,
              firstName,
              lastName,
              email,
              phone: phone || null,
              userId: userAccountInfo.userId,
              role: role!,
              status: 'active',
            },
          });
          createdRecordId = staff.id;
          logger.info(programId, `Created staff "${firstName} ${lastName}" as ${role} (id: ${staff.id}, userId: ${userAccountInfo.userId}) from application by ${caller.email}`);
        } catch (staffCreateError: any) {
          throw staffCreateError;
        }
      }

      // Send acceptance email (don't block on failure)
      const programName = program.name || 'Boys State';
      sendAcceptanceEmail(
        programId,
        email,
        firstName,
        lastName,
        programName,
        applicationYear,
        type as 'delegate' | 'staff',
        role,
        userAccountInfo?.tempPassword,
      ).catch((err) => {
        logger.warn(programId, `Failed to send acceptance email to ${email}: ${err.message}`);
      });
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

    const responsePayload = {
      success: true,
      ...(createdRecordId ? { [`${type}Id`]: createdRecordId } : {}),
      ...(userAccountInfo ? {
        userAccount: {
          userId: userAccountInfo.userId,
          isNew: userAccountInfo.isNew,
          // Include temp password so it can be communicated to the user
          // In production, you would email this instead of returning it
          ...(userAccountInfo.tempPassword ? { tempPassword: userAccountInfo.tempPassword } : {}),
        },
      } : {}),
    };
    res.json(responsePayload);
    } catch (error: any) {
      logger.error(programId, `Error in ${decision} handler: ${error.message}`, error);
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
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

