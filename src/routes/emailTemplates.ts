import express from 'express';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';

const router = express.Router();

// Template types with their descriptions and available placeholders
export const TEMPLATE_TYPES = {
  delegate_welcome: {
    name: 'Delegate Welcome Email',
    description: 'Sent to delegates when their application is accepted',
    placeholders: ['{{firstName}}', '{{lastName}}', '{{fullName}}', '{{programName}}', '{{programYear}}', '{{emailAddress}}', '{{tempPassword}}'],
  },
  staff_welcome: {
    name: 'Staff Welcome Email',
    description: 'Sent to staff members when their application is accepted',
    placeholders: ['{{firstName}}', '{{lastName}}', '{{fullName}}', '{{programName}}', '{{programYear}}', '{{staffRole}}', '{{emailAddress}}', '{{tempPassword}}'],
  },
};

// Default templates
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  delegate_welcome: {
    subject: 'Welcome to {{programName}} - Your Application Has Been Accepted!',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1B3D6D;">Welcome to {{programName}}!</h2>
  <p>Dear {{firstName}},</p>
  <p>Congratulations! Your application to <strong>{{programName}}</strong> has been accepted as a <strong>Delegate</strong>.</p>
  <p>You will have access to the Boys State mobile app to participate in program activities.</p>
  {{#if tempPassword}}
  <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Your temporary password:</strong></p>
    <p style="font-family: monospace; font-size: 18px; margin: 10px 0; color: #1B3D6D;">{{tempPassword}}</p>
    <p style="margin: 0; font-size: 12px; color: #666;">Please log in and change your password as soon as possible.</p>
  </div>
  {{/if}}
  <p>If you have any questions, please contact us at <a href="mailto:{{emailAddress}}">{{emailAddress}}</a>.</p>
  <p>Best regards,<br>{{programName}} Team</p>
</div>`,
  },
  staff_welcome: {
    subject: 'Welcome to {{programName}} - You Have Been Added as {{staffRole}}!',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1B3D6D;">Welcome to {{programName}}!</h2>
  <p>Dear {{firstName}},</p>
  <p>Congratulations! Your application to <strong>{{programName}}</strong> has been accepted as a <strong>{{staffRole}}</strong>.</p>
  <p>You have been granted access to the Boys State App web portal where you can manage program activities.</p>
  {{#if tempPassword}}
  <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Your temporary password:</strong></p>
    <p style="font-family: monospace; font-size: 18px; margin: 10px 0; color: #1B3D6D;">{{tempPassword}}</p>
    <p style="margin: 0; font-size: 12px; color: #666;">Please log in and change your password as soon as possible.</p>
  </div>
  {{/if}}
  <p>If you have any questions, please contact us at <a href="mailto:{{emailAddress}}">{{emailAddress}}</a>.</p>
  <p>Best regards,<br>{{programName}} Team</p>
</div>`,
  },
};

// GET /api/programs/:programId/email-templates
// Returns all email templates for a program (with defaults for unconfigured ones)
router.get('/api/programs/:programId/email-templates', async (req, res) => {
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

  // Get saved templates
  const savedTemplates = await prisma.emailTemplate.findMany({
    where: { programId },
  });

  // Build response with all template types
  const templates = Object.entries(TEMPLATE_TYPES).map(([type, info]) => {
    const saved = savedTemplates.find(t => t.templateType === type);
    const defaultTemplate = DEFAULT_TEMPLATES[type];

    return {
      templateType: type,
      name: info.name,
      description: info.description,
      placeholders: info.placeholders,
      subject: saved?.subject || defaultTemplate?.subject || '',
      body: saved?.body || defaultTemplate?.body || '',
      enabled: saved?.enabled ?? true,
      isCustomized: !!saved,
    };
  });

  res.json({
    programId,
    programName: program.name,
    templates,
  });
});

// GET /api/programs/:programId/email-templates/:templateType
router.get('/api/programs/:programId/email-templates/:templateType', async (req, res) => {
  const { programId, templateType } = req.params as { programId: string; templateType: string };
  const caller = (req as any).user as { userId: number };

  if (!programId || !templateType) {
    res.status(400).json({ error: 'programId and templateType required' });
    return;
  }

  if (!TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES]) {
    res.status(400).json({ error: 'Invalid template type' });
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

  const template = await prisma.emailTemplate.findUnique({
    where: { programId_templateType: { programId, templateType } },
  });

  const info = TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES];
  const defaultTemplate = DEFAULT_TEMPLATES[templateType];

  res.json({
    programId,
    programName: program.name,
    templateType,
    name: info.name,
    description: info.description,
    placeholders: info.placeholders,
    subject: template?.subject || defaultTemplate?.subject || '',
    body: template?.body || defaultTemplate?.body || '',
    enabled: template?.enabled ?? true,
    isCustomized: !!template,
  });
});

// PUT /api/programs/:programId/email-templates/:templateType
router.put('/api/programs/:programId/email-templates/:templateType', async (req, res) => {
  const { programId, templateType } = req.params as { programId: string; templateType: string };
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId || !templateType) {
    res.status(400).json({ error: 'programId and templateType required' });
    return;
  }

  if (!TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES]) {
    res.status(400).json({ error: 'Invalid template type' });
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

  const { subject, body, enabled } = req.body as {
    subject?: string;
    body?: string;
    enabled?: boolean;
  };

  if (!subject || !body) {
    res.status(400).json({ error: 'Subject and body are required' });
    return;
  }

  const template = await prisma.emailTemplate.upsert({
    where: { programId_templateType: { programId, templateType } },
    update: {
      subject,
      body,
      enabled: enabled !== false,
    },
    create: {
      programId,
      templateType,
      subject,
      body,
      enabled: enabled !== false,
    },
  });

  logger.info(programId, `Email template '${templateType}' updated by ${caller.email}`);

  const info = TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES];

  res.json({
    success: true,
    programId: template.programId,
    templateType: template.templateType,
    name: info.name,
    subject: template.subject,
    body: template.body,
    enabled: template.enabled,
    isCustomized: true,
  });
});

// POST /api/programs/:programId/email-templates/:templateType/reset
// Reset a template to default
router.post('/api/programs/:programId/email-templates/:templateType/reset', async (req, res) => {
  const { programId, templateType } = req.params as { programId: string; templateType: string };
  const caller = (req as any).user as { userId: number; email: string };

  if (!programId || !templateType) {
    res.status(400).json({ error: 'programId and templateType required' });
    return;
  }

  if (!TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES]) {
    res.status(400).json({ error: 'Invalid template type' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }

  // Delete custom template to revert to default
  await prisma.emailTemplate.deleteMany({
    where: { programId, templateType },
  });

  logger.info(programId, `Email template '${templateType}' reset to default by ${caller.email}`);

  const info = TEMPLATE_TYPES[templateType as keyof typeof TEMPLATE_TYPES];
  const defaultTemplate = DEFAULT_TEMPLATES[templateType];

  res.json({
    success: true,
    templateType,
    name: info.name,
    subject: defaultTemplate?.subject || '',
    body: defaultTemplate?.body || '',
    enabled: true,
    isCustomized: false,
  });
});

// Helper function to get a template for sending (used by email.ts)
export async function getEmailTemplate(
  programId: string,
  templateType: string,
): Promise<{ subject: string; body: string; enabled: boolean } | null> {
  const template = await prisma.emailTemplate.findUnique({
    where: { programId_templateType: { programId, templateType } },
  });

  if (template) {
    return {
      subject: template.subject,
      body: template.body,
      enabled: template.enabled,
    };
  }

  // Return default template
  const defaultTemplate = DEFAULT_TEMPLATES[templateType];
  if (defaultTemplate) {
    return {
      subject: defaultTemplate.subject,
      body: defaultTemplate.body,
      enabled: true,
    };
  }

  return null;
}

// Helper function to render a template with variables
export function renderTemplate(
  template: string,
  variables: Record<string, string | undefined>,
): string {
  let rendered = template;

  // Replace simple placeholders {{variable}}
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, value || '');
  }

  // Handle conditional blocks {{#if variable}}...{{/if}}
  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  rendered = rendered.replace(conditionalRegex, (_match, varName, content) => {
    const value = variables[varName];
    return value ? content : '';
  });

  return rendered;
}

export default router;
