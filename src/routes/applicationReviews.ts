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
    });

    res.json(responses);
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
      include: { answers: true },
    });
    if (!response) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(response);
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

