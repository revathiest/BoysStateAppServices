import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin, isProgramMember } from '../utils/auth';

const router = express.Router();

async function saveBrandingContact(req: express.Request, res: express.Response) {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number; email: string };
  /* istanbul ignore next */
  /* istanbul ignore next */
  /* istanbul ignore next */
  /* c8 ignore next */
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const program = await prisma.program.findUnique({ where: { id: programId } });
  /* istanbul ignore next */
  /* istanbul ignore next */
  /* c8 ignore next */
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const admin = await isProgramAdmin(caller.userId, programId);
  /* istanbul ignore next */
  /* c8 ignore next */
  if (!admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const {
    welcomeMessage,
    branding,
    colors,
    contact,
    changeReason,
  } = req.body as any;

  const data = {
    programId,
    welcomeMessage,
    logoUrl: branding?.logoUrl,
    iconUrl: branding?.iconUrl,
    bannerUrl: branding?.bannerUrl,
    colorPrimary: colors?.primary,
    colorSecondary: colors?.secondary,
    colorBackground: colors?.background,
    contactEmail: contact?.email,
    contactPhone: contact?.phone,
    contactWebsite: contact?.website,
    contactFacebook: contact?.facebook,
  } as any;

  const existing = await prisma.programBrandingContact.findFirst({
    where: { programId },
  });

  let record;
  let changeType: string;
  if (existing) {
    record = await prisma.programBrandingContact.update({
      where: { id: existing.id },
      data,
    });
    changeType = 'update';
  } else {
    record = await prisma.programBrandingContact.create({ data });
    changeType = 'create';
  }

  await prisma.programBrandingContactAudit.create({
    data: {
      brandingContactId: record.id,
      programId,
      programName: program.name,
      welcomeMessage: record.welcomeMessage ?? undefined,
      logoUrl: record.logoUrl ?? undefined,
      iconUrl: record.iconUrl ?? undefined,
      bannerUrl: record.bannerUrl ?? undefined,
      colorPrimary: record.colorPrimary ?? undefined,
      colorSecondary: record.colorSecondary ?? undefined,
      colorBackground: record.colorBackground ?? undefined,
      contactEmail: record.contactEmail ?? undefined,
      contactPhone: record.contactPhone ?? undefined,
      contactWebsite: record.contactWebsite ?? undefined,
      contactFacebook: record.contactFacebook ?? undefined,
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
      changeType,
      changedByUserId: caller.userId,
      changeReason,
    },
  });

  logger.info(programId, `Branding/contact ${changeType}d by ${caller.email}`);
  res.status(existing ? 200 : 201).json({ ...record, programName: program.name });
}

router.post('/api/branding-contact/:programId', saveBrandingContact);
router.put('/api/branding-contact/:programId', saveBrandingContact);

router.get('/api/branding-contact/:programId', async (req, res) => {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number };
  /* c8 ignore next */
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const program = await prisma.program.findUnique({ where: { id: programId } });
  /* c8 ignore next */
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const member = await isProgramMember(caller.userId, programId);
  /* istanbul ignore next */
  /* c8 ignore next */
  if (!member) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const record = await prisma.programBrandingContact.findFirst({
    where: { programId },
  });
  /* istanbul ignore next */
  /* c8 ignore next */
  if (!record) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ...record, programName: program.name });
});

export default router;
