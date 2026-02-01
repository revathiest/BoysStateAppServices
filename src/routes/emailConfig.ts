import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';
import { sendTestEmail, createTransporterFromConfig } from '../email';

const router = express.Router();

// Simple encryption/decryption for SMTP password storage
// In production, use a proper encryption library with secure key management
const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || 'default-key-change-in-production';

function encryptPassword(password: string): string {
  // Simple XOR-based obfuscation - NOT cryptographically secure
  // In production, use proper encryption (e.g., crypto.createCipheriv with AES)
  const encoded = Buffer.from(password).toString('base64');
  return `enc:${encoded}`;
}

function decryptPassword(encrypted: string): string {
  if (encrypted.startsWith('enc:')) {
    return Buffer.from(encrypted.slice(4), 'base64').toString('utf-8');
  }
  // Legacy unencrypted password
  return encrypted;
}

// GET /api/programs/:programId/email-config
router.get('/api/programs/:programId/email-config', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number };

  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Program not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  const config = await prisma.emailConfig.findUnique({
    where: { programId },
  });

  if (!config) {
    // Return empty config template
    res.json({
      programId,
      programName: program.name,
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '', // Don't return actual password
      fromEmail: '',
      fromName: program.name,
      enabled: false,
      configured: false,
    });
    return;
  }

  // Return config without the actual password
  res.json({
    programId: config.programId,
    programName: program.name,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    smtpPass: '', // Never return the actual password
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    enabled: config.enabled,
    configured: true,
    hasPassword: !!config.smtpPass,
  });
});

// PUT /api/programs/:programId/email-config
router.put('/api/programs/:programId/email-config', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Program not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName, enabled } = req.body as {
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromEmail?: string;
    fromName?: string;
    enabled?: boolean;
  };

  // Validate required fields
  if (!smtpHost || !smtpUser || !fromEmail) {
    res.status(400).json({ error: 'SMTP host, user, and from email are required' });
    return;
  }

  // Check if config exists
  const existing = await prisma.emailConfig.findUnique({
    where: { programId },
  });

  // Prepare data - only update password if provided
  const data: any = {
    smtpHost,
    smtpPort: smtpPort || 587,
    smtpUser,
    fromEmail,
    fromName: fromName || program.name,
    enabled: enabled !== false,
  };

  // Only update password if a new one is provided
  if (smtpPass && smtpPass.trim() !== '') {
    data.smtpPass = encryptPassword(smtpPass);
  } else if (!existing) {
    // New config requires password
    res.status(400).json({ error: 'SMTP password is required for new configuration' });
    return;
  }

  let config;
  if (existing) {
    config = await prisma.emailConfig.update({
      where: { programId },
      data,
    });
    logger.info(programId, `Email configuration updated by ${caller.email}`);
  } else {
    config = await prisma.emailConfig.create({
      data: {
        ...data,
        programId,
      },
    });
    logger.info(programId, `Email configuration created by ${caller.email}`);
  }

  res.json({
    success: true,
    programId: config.programId,
    programName: program.name,
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    fromEmail: config.fromEmail,
    fromName: config.fromName,
    enabled: config.enabled,
    configured: true,
  });
});

// POST /api/programs/:programId/email-config/test
// Tests email config using values provided in request body (does not require saved config)
router.post('/api/programs/:programId/email-config/test', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) {
    res.status(404).json({ error: 'Program not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  const { testEmail, smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = req.body as {
    testEmail?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
    fromEmail?: string;
    fromName?: string;
  };

  if (!testEmail) {
    res.status(400).json({ error: 'Test email address is required' });
    return;
  }

  // Validate required SMTP fields
  if (!smtpHost || !smtpUser || !fromEmail) {
    res.status(400).json({ error: 'SMTP host, user, and from email are required to test' });
    return;
  }

  // Check if we have a password - either provided or from existing config
  let password = smtpPass;
  if (!password || password.trim() === '') {
    // Try to get password from existing config
    const existingConfig = await prisma.emailConfig.findUnique({
      where: { programId },
    });
    if (existingConfig && existingConfig.smtpPass) {
      password = decryptPassword(existingConfig.smtpPass);
    } else {
      res.status(400).json({ error: 'SMTP password is required to test' });
      return;
    }
  }

  try {
    // Create transporter with the provided config values
    const transporterConfig = {
      smtpHost,
      smtpPort: smtpPort || 587,
      smtpUser,
      smtpPass: password,
      fromEmail,
      fromName: fromName || program.name,
    };

    const transporter = createTransporterFromConfig(transporterConfig);
    if (!transporter) {
      res.status(500).json({ error: 'Failed to create email transporter. Nodemailer may not be installed.' });
      return;
    }

    // Send test email
    const success = await sendTestEmail(transporter, transporterConfig, testEmail, program.name);

    if (success) {
      logger.info(programId, `Test email sent to ${testEmail} by ${caller.email}`);
      res.json({ success: true, message: `Test email sent successfully to ${testEmail}` });
    } else {
      res.status(500).json({ error: 'Failed to send test email. Please verify your SMTP settings.' });
    }
  } catch (err: any) {
    logger.error(programId, `Failed to send test email: ${err.message}`);
    res.status(500).json({ error: `Failed to send test email: ${err.message}` });
  }
});

// DELETE /api/programs/:programId/email-config
router.delete('/api/programs/:programId/email-config', async (req, res) => {
  const { programId } = req.params as { programId: string };
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  const existing = await prisma.emailConfig.findUnique({
    where: { programId },
  });

  if (!existing) {
    res.status(404).json({ error: 'Email configuration not found' });
    return;
  }

  await prisma.emailConfig.delete({
    where: { programId },
  });

  logger.info(programId, `Email configuration deleted by ${caller.email}`);
  res.json({ success: true, message: 'Email configuration deleted' });
});

export { decryptPassword };
export default router;
