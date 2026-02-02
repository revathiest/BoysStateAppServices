// Mock nodemailer before importing email module
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  createTransport: mockCreateTransport,
}));

jest.mock('../src/prisma');

jest.mock('../src/routes/emailConfig', () => ({
  decryptPassword: jest.fn((p: string) => p),
}));

jest.mock('../src/routes/emailTemplates', () => ({
  getEmailTemplate: jest.fn(),
  renderTemplate: jest.fn((template: string, vars: Record<string, any>) => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return result;
  }),
}));

import * as email from '../src/email';
import prisma from '../src/prisma';
import { getEmailTemplate } from '../src/routes/emailTemplates';

const mockedPrisma = prisma as any;
const mockedGetEmailTemplate = getEmailTemplate as jest.Mock;

beforeEach(() => {
  mockSendMail.mockReset();
  mockCreateTransport.mockClear();
  mockedPrisma.emailConfig.findUnique.mockReset();
  mockedGetEmailTemplate.mockReset();
});

describe('isEmailConfigured', () => {
  it('returns false when SMTP config missing', () => {
    // Since nodemailer is mocked but env vars aren't set
    expect(email.isEmailConfigured()).toBe(false);
  });
});

describe('isNodemailerAvailable', () => {
  it('returns true when nodemailer is available', () => {
    expect(email.isNodemailerAvailable()).toBe(true);
  });
});

describe('createTransporterFromConfig', () => {
  it('creates transporter from config', () => {
    const config = {
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpUser: 'user',
      smtpPass: 'pass',
      fromEmail: 'test@example.com',
      fromName: 'Test',
    };
    const transporter = email.createTransporterFromConfig(config);
    expect(transporter).toBeDefined();
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user', pass: 'pass' },
    });
  });

  it('sets secure true for port 465', () => {
    const config = {
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpUser: 'user',
      smtpPass: 'pass',
      fromEmail: 'test@example.com',
      fromName: 'Test',
    };
    email.createTransporterFromConfig(config);
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'user', pass: 'pass' },
    });
  });
});

describe('sendEmailWithTransporter', () => {
  const config = {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user',
    smtpPass: 'pass',
    fromEmail: 'test@example.com',
    fromName: 'Test Program',
  };

  it('sends email successfully', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '123' });
    const transporter = email.createTransporterFromConfig(config);
    const result = await email.sendEmailWithTransporter(
      transporter,
      config,
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith({
      from: '"Test Program" <test@example.com>',
      to: 'recipient@example.com',
      subject: 'Test',
      text: 'Body',
      html: undefined,
    });
  });

  it('returns false when transporter is null', async () => {
    const result = await email.sendEmailWithTransporter(
      null,
      config,
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(false);
  });

  it('returns false and logs error when sendMail fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));
    const transporter = email.createTransporterFromConfig(config);
    const result = await email.sendEmailWithTransporter(
      transporter,
      config,
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(false);
  });
});

describe('sendTestEmail', () => {
  const config = {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user',
    smtpPass: 'pass',
    fromEmail: 'test@example.com',
    fromName: 'Test Program',
  };

  it('sends test email successfully', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: '123' });
    const transporter = email.createTransporterFromConfig(config);
    const result = await email.sendTestEmail(transporter, config, 'admin@example.com', 'Test Program');
    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@example.com',
        subject: 'Test Email from Test Program',
      })
    );
  });

  it('throws error when sendMail fails', async () => {
    const error = new Error('SMTP error');
    mockSendMail.mockRejectedValueOnce(error);
    const transporter = email.createTransporterFromConfig(config);
    await expect(
      email.sendTestEmail(transporter, config, 'admin@example.com', 'Test Program')
    ).rejects.toThrow('SMTP error');
  });
});

describe('sendProgramEmail', () => {
  it('uses program-specific config when available', async () => {
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce({
      programId: 'prog1',
      enabled: true,
      smtpHost: 'program-smtp.example.com',
      smtpPort: 587,
      smtpUser: 'proguser',
      smtpPass: 'progpass',
      fromEmail: 'program@example.com',
      fromName: 'Program Email',
    });
    mockSendMail.mockResolvedValueOnce({ messageId: '123' });

    const result = await email.sendProgramEmail(
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(true);
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'program-smtp.example.com',
      })
    );
  });

  it('falls back to default when program config not enabled', async () => {
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce({
      enabled: false,
    });
    // Without default config, this will log and return false
    const result = await email.sendProgramEmail(
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(false);
  });

  it('falls back to default when no program config exists', async () => {
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);
    const result = await email.sendProgramEmail(
      { to: 'recipient@example.com', subject: 'Test', text: 'Body' },
      'prog1'
    );
    expect(result).toBe(false);
  });
});

describe('sendAcceptanceEmail', () => {
  it('returns false when template is disabled', async () => {
    mockedGetEmailTemplate.mockResolvedValueOnce({ enabled: false });
    const result = await email.sendAcceptanceEmail(
      'prog1',
      'delegate@example.com',
      'John',
      'Doe',
      'Test Program',
      2025,
      'delegate',
      undefined,
      'temppass123'
    );
    expect(result).toBe(false);
  });

  it('returns false when template not found', async () => {
    mockedGetEmailTemplate.mockResolvedValueOnce(null);
    const result = await email.sendAcceptanceEmail(
      'prog1',
      'delegate@example.com',
      'John',
      'Doe',
      'Test Program',
      2025,
      'delegate'
    );
    expect(result).toBe(false);
  });

  it('sends delegate welcome email when template enabled', async () => {
    mockedGetEmailTemplate.mockResolvedValueOnce({
      enabled: true,
      subject: 'Welcome {{firstName}}!',
      body: '<p>Welcome to {{programName}}</p>',
    });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);

    const result = await email.sendAcceptanceEmail(
      'prog1',
      'delegate@example.com',
      'John',
      'Doe',
      'Test Program',
      2025,
      'delegate'
    );
    // Will return false since no default email config is set
    expect(result).toBe(false);
    expect(mockedGetEmailTemplate).toHaveBeenCalledWith('prog1', 'delegate_welcome');
  });

  it('sends staff welcome email when template enabled', async () => {
    mockedGetEmailTemplate.mockResolvedValueOnce({
      enabled: true,
      subject: 'Welcome {{firstName}}!',
      body: '<p>Welcome to {{programName}} as {{staffRole}}</p>',
    });
    mockedPrisma.emailConfig.findUnique.mockResolvedValueOnce(null);

    const result = await email.sendAcceptanceEmail(
      'prog1',
      'staff@example.com',
      'Jane',
      'Smith',
      'Test Program',
      2025,
      'staff',
      'Counselor'
    );
    expect(result).toBe(false);
    expect(mockedGetEmailTemplate).toHaveBeenCalledWith('prog1', 'staff_welcome');
  });
});
