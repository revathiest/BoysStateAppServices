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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decryptPassword = decryptPassword;
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("../prisma"));
const logger = __importStar(require("../logger"));
const auth_1 = require("../utils/auth");
const email_1 = require("../email");
const router = express_1.default.Router();
// Simple encryption/decryption for SMTP password storage
// In production, use a proper encryption library with secure key management
const ENCRYPTION_KEY = process.env.SMTP_ENCRYPTION_KEY || 'default-key-change-in-production';
function encryptPassword(password) {
    // Simple XOR-based obfuscation - NOT cryptographically secure
    // In production, use proper encryption (e.g., crypto.createCipheriv with AES)
    const encoded = Buffer.from(password).toString('base64');
    return `enc:${encoded}`;
}
function decryptPassword(encrypted) {
    if (encrypted.startsWith('enc:')) {
        return Buffer.from(encrypted.slice(4), 'base64').toString('utf-8');
    }
    // Legacy unencrypted password
    return encrypted;
}
// GET /api/programs/:programId/email-config
router.get('/api/programs/:programId/email-config', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' });
        return;
    }
    const config = await prisma_1.default.emailConfig.findUnique({
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
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' });
        return;
    }
    const { smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName, enabled } = req.body;
    // Validate required fields
    if (!smtpHost || !smtpUser || !fromEmail) {
        res.status(400).json({ error: 'SMTP host, user, and from email are required' });
        return;
    }
    // Check if config exists
    const existing = await prisma_1.default.emailConfig.findUnique({
        where: { programId },
    });
    // Prepare data - only update password if provided
    const data = {
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
    }
    else if (!existing) {
        // New config requires password
        res.status(400).json({ error: 'SMTP password is required for new configuration' });
        return;
    }
    let config;
    if (existing) {
        config = await prisma_1.default.emailConfig.update({
            where: { programId },
            data,
        });
        logger.info(programId, `Email configuration updated by ${caller.email}`);
    }
    else {
        config = await prisma_1.default.emailConfig.create({
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
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    if (!program) {
        res.status(404).json({ error: 'Program not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' });
        return;
    }
    const { testEmail, smtpHost, smtpPort, smtpUser, smtpPass, fromEmail, fromName } = req.body;
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
        const existingConfig = await prisma_1.default.emailConfig.findUnique({
            where: { programId },
        });
        if (existingConfig && existingConfig.smtpPass) {
            password = decryptPassword(existingConfig.smtpPass);
        }
        else {
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
        const transporter = (0, email_1.createTransporterFromConfig)(transporterConfig);
        if (!transporter) {
            res.status(500).json({ error: 'Failed to create email transporter. Nodemailer may not be installed.' });
            return;
        }
        // Send test email
        const success = await (0, email_1.sendTestEmail)(transporter, transporterConfig, testEmail, program.name);
        if (success) {
            logger.info(programId, `Test email sent to ${testEmail} by ${caller.email}`);
            res.json({ success: true, message: `Test email sent successfully to ${testEmail}` });
        }
        else {
            res.status(500).json({ error: 'Failed to send test email. Please verify your SMTP settings.' });
        }
    }
    catch (err) {
        logger.error(programId, `Failed to send test email: ${err.message}`);
        res.status(500).json({ error: `Failed to send test email: ${err.message}` });
    }
});
// DELETE /api/programs/:programId/email-config
router.delete('/api/programs/:programId/email-config', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden: Admin access required' });
        return;
    }
    const existing = await prisma_1.default.emailConfig.findUnique({
        where: { programId },
    });
    if (!existing) {
        res.status(404).json({ error: 'Email configuration not found' });
        return;
    }
    await prisma_1.default.emailConfig.delete({
        where: { programId },
    });
    logger.info(programId, `Email configuration deleted by ${caller.email}`);
    res.json({ success: true, message: 'Email configuration deleted' });
});
exports.default = router;
