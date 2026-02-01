"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEmailConfigured = isEmailConfigured;
exports.isNodemailerAvailable = isNodemailerAvailable;
exports.createTransporterFromConfig = createTransporterFromConfig;
exports.sendEmailWithTransporter = sendEmailWithTransporter;
exports.sendEmail = sendEmail;
exports.sendTestEmail = sendTestEmail;
exports.sendProgramEmail = sendProgramEmail;
exports.sendAcceptanceEmail = sendAcceptanceEmail;
const logger = __importStar(require("./logger"));
// Try to import nodemailer - it's optional
let nodemailer = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nodemailer = require('nodemailer');
}
catch {
    // Nodemailer not installed - email will be logged only
}
// Email configuration from environment variables (fallback)
const defaultEmailConfig = {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587'),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    fromEmail: process.env.EMAIL_FROM || 'noreply@boysstateapp.com',
    fromName: process.env.EMAIL_FROM_NAME || 'Boys State App',
};
// Check if default email is configured
function isEmailConfigured() {
    return !!(nodemailer && defaultEmailConfig.smtpHost && defaultEmailConfig.smtpUser && defaultEmailConfig.smtpPass);
}
// Check if nodemailer is available
function isNodemailerAvailable() {
    return !!nodemailer;
}
// Nodemailer transporter for default config (lazy-loaded)
let defaultTransporter = null;
async function getDefaultTransporter() {
    if (!defaultTransporter && isEmailConfigured()) {
        try {
            defaultTransporter = nodemailer.createTransport({
                host: defaultEmailConfig.smtpHost,
                port: defaultEmailConfig.smtpPort,
                secure: defaultEmailConfig.smtpPort === 465,
                auth: {
                    user: defaultEmailConfig.smtpUser,
                    pass: defaultEmailConfig.smtpPass,
                },
            });
        }
        catch (err) {
            logger.warn('system', 'Failed to create default email transporter. Email sending disabled.');
            return null;
        }
    }
    return defaultTransporter;
}
// Create a transporter from a custom config (for program-specific settings)
function createTransporterFromConfig(config) {
    if (!nodemailer) {
        return null;
    }
    try {
        return nodemailer.createTransport({
            host: config.smtpHost,
            port: config.smtpPort,
            secure: config.smtpPort === 465,
            auth: {
                user: config.smtpUser,
                pass: config.smtpPass,
            },
        });
    }
    catch (err) {
        return null;
    }
}
// Send email using provided transporter and config
async function sendEmailWithTransporter(transporter, config, options, programId) {
    if (!transporter) {
        logger.info(programId, `[EMAIL] Would send email to: ${options.to}`);
        logger.info(programId, `[EMAIL] Subject: ${options.subject}`);
        logger.info(programId, `[EMAIL] Body: ${options.text}`);
        return false;
    }
    try {
        await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromEmail}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        });
        logger.info(programId, `Email sent successfully to ${options.to}`);
        return true;
    }
    catch (err) {
        logger.error(programId, `Failed to send email to ${options.to}`, err);
        return false;
    }
}
// Send email using default config
async function sendEmail(options, programId) {
    const transport = await getDefaultTransporter();
    if (!transport) {
        // Log the email that would have been sent (for development)
        logger.info(programId, `[EMAIL] Would send email to: ${options.to}`);
        logger.info(programId, `[EMAIL] Subject: ${options.subject}`);
        logger.info(programId, `[EMAIL] Body: ${options.text}`);
        return false;
    }
    try {
        await transport.sendMail({
            from: `"${defaultEmailConfig.fromName}" <${defaultEmailConfig.fromEmail}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
        });
        logger.info(programId, `Email sent successfully to ${options.to}`);
        return true;
    }
    catch (err) {
        logger.error(programId, `Failed to send email to ${options.to}`, err);
        return false;
    }
}
// Send a test email to verify configuration
async function sendTestEmail(transporter, config, testEmail, programName) {
    const subject = `Test Email from ${programName}`;
    const text = `This is a test email from ${programName} to verify your email configuration is working correctly.

If you received this email, your SMTP settings are configured properly.

Time sent: ${new Date().toISOString()}`;
    const html = `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #1B3D6D;">Test Email from ${programName}</h2>
  <p>This is a test email to verify your email configuration is working correctly.</p>
  <div style="background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p style="margin: 0; color: #2e7d32;"><strong>✓ Success!</strong></p>
    <p style="margin: 5px 0 0 0;">If you received this email, your SMTP settings are configured properly.</p>
  </div>
  <p style="color: #666; font-size: 12px;">Time sent: ${new Date().toISOString()}</p>
</div>`;
    try {
        await transporter.sendMail({
            from: `"${config.fromName}" <${config.fromEmail}>`,
            to: testEmail,
            subject,
            text,
            html,
        });
        return true;
    }
    catch (err) {
        throw err;
    }
}
// Get program-specific email config from database
async function getProgramEmailConfig(programId) {
    // Lazy import prisma to avoid circular dependencies
    const prisma = (await Promise.resolve().then(() => __importStar(require('./prisma')))).default;
    const { decryptPassword } = await Promise.resolve().then(() => __importStar(require('./routes/emailConfig')));
    const config = await prisma.emailConfig.findUnique({
        where: { programId },
    });
    if (!config || !config.enabled) {
        return null;
    }
    return {
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpUser: config.smtpUser,
        smtpPass: decryptPassword(config.smtpPass),
        fromEmail: config.fromEmail,
        fromName: config.fromName || 'Boys State App',
    };
}
// Send email using program-specific config if available, otherwise fall back to default
async function sendProgramEmail(options, programId) {
    // Try to get program-specific config
    const programConfig = await getProgramEmailConfig(programId);
    if (programConfig && nodemailer) {
        const transporter = createTransporterFromConfig(programConfig);
        if (transporter) {
            return sendEmailWithTransporter(transporter, programConfig, options, programId);
        }
    }
    // Fall back to default config
    return sendEmail(options, programId);
}
// Send welcome email for accepted application using templates
async function sendAcceptanceEmail(programId, recipientEmail, firstName, lastName, programName, programYear, role, staffRole, tempPassword) {
    // Import template functions
    const { getEmailTemplate, renderTemplate } = await Promise.resolve().then(() => __importStar(require('./routes/emailTemplates')));
    const templateType = role === 'delegate' ? 'delegate_welcome' : 'staff_welcome';
    const template = await getEmailTemplate(programId, templateType);
    if (!template || !template.enabled) {
        logger.info(programId, `Email template '${templateType}' is disabled, skipping email to ${recipientEmail}`);
        return false;
    }
    // Get program email address from config
    const programConfig = await getProgramEmailConfig(programId);
    const emailAddress = programConfig?.fromEmail || defaultEmailConfig.fromEmail;
    const fullName = `${firstName} ${lastName}`;
    const variables = {
        firstName,
        lastName,
        fullName,
        programName,
        programYear: programYear.toString(),
        tempPassword,
        staffRole: staffRole || 'Staff',
        emailAddress,
    };
    // Debug logging for tempPassword
    logger.info(programId, `[EMAIL DEBUG] Sending ${role} acceptance email to ${recipientEmail}`);
    logger.info(programId, `[EMAIL DEBUG] tempPassword provided: ${tempPassword ? 'YES' : 'NO'}`);
    if (tempPassword) {
        logger.info(programId, `[EMAIL DEBUG] tempPassword value: ${tempPassword.substring(0, 4)}****`);
    }
    logger.info(programId, `[EMAIL DEBUG] Template body contains tempPassword block: ${template.body.includes('tempPassword')}`);
    const subject = renderTemplate(template.subject, variables);
    const html = renderTemplate(template.body, variables);
    logger.info(programId, `[EMAIL DEBUG] Rendered HTML contains password section: ${html.includes('temporary password') || html.includes('tempPassword')}`);
    // Generate plain text from HTML (simple conversion)
    const text = html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return sendProgramEmail({ to: recipientEmail, subject, text, html }, programId);
}
