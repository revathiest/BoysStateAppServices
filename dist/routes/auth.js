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
exports.loginAttempts = void 0;
const express_1 = __importDefault(require("express"));
const crypto_1 = require("crypto");
const util_1 = require("util");
const prisma_1 = __importDefault(require("../prisma"));
const jwt_1 = require("../jwt");
const logger = __importStar(require("../logger"));
const config_1 = require("../config");
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const router = express_1.default.Router();
exports.loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
    }
    const existing = await prisma_1.default.user.findUnique({ where: { email } });
    if (existing) {
        res.status(400).json({ error: 'User already exists' });
        return;
    }
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const buf = (await scrypt(password, salt, 64));
    const hashed = `${salt}:${buf.toString('hex')}`;
    await prisma_1.default.user.create({ data: { email, password: hashed } });
    logger.info('system', `User registered: ${email}`);
    res.status(201).json({ message: 'User created' });
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
    }
    const now = Date.now();
    const ip = req.ip || '';
    const attempt = exports.loginAttempts.get(ip);
    if (attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) {
        logger.warn('system', `Too many login attempts from ${ip}`);
        res.status(429).json({ error: 'Too many login attempts' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
        exports.loginAttempts.set(ip, { count, lastAttempt: now });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const [salt, storedHash] = user.password.split(':');
    const buf = (await scrypt(password, salt, 64));
    if (buf.toString('hex') !== storedHash) {
        const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
        exports.loginAttempts.set(ip, { count, lastAttempt: now });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    exports.loginAttempts.delete(ip);
    const token = (0, jwt_1.sign)({ userId: user.id, email: user.email }, config_1.config.jwtSecret);
    logger.info('system', `User logged in: ${email}`);
    res.json({ token });
});
// Refresh token (authenticated user)
router.post('/refresh', async (req, res) => {
    const caller = req.user;
    if (!caller) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    // Verify user still exists
    const user = await prisma_1.default.user.findUnique({ where: { id: caller.userId } });
    if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
    }
    // Issue a new token
    const token = (0, jwt_1.sign)({ userId: user.id, email: user.email }, config_1.config.jwtSecret);
    logger.info('system', `Token refreshed for: ${user.email}`);
    res.json({ token });
});
// Change own password (authenticated user)
router.put('/change-password', async (req, res) => {
    const caller = req.user;
    if (!caller) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Current password and new password required' });
        return;
    }
    if (newPassword.length < 8) {
        res.status(400).json({ error: 'New password must be at least 8 characters' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { id: caller.userId } });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Verify current password
    const [salt, storedHash] = user.password.split(':');
    const buf = (await scrypt(currentPassword, salt, 64));
    if (buf.toString('hex') !== storedHash) {
        res.status(401).json({ error: 'Current password is incorrect' });
        return;
    }
    // Hash new password
    const newSalt = (0, crypto_1.randomBytes)(16).toString('hex');
    const newBuf = (await scrypt(newPassword, newSalt, 64));
    const newHashed = `${newSalt}:${newBuf.toString('hex')}`;
    await prisma_1.default.user.update({
        where: { id: caller.userId },
        data: { password: newHashed },
    });
    logger.info('system', `User ${caller.email} changed their password`);
    res.json({ message: 'Password changed successfully' });
});
// Admin reset password for a user (by staff/delegate ID)
router.put('/users/:userId/password', async (req, res) => {
    const caller = req.user;
    if (!caller) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const { userId } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) {
        res.status(400).json({ error: 'New password required' });
        return;
    }
    if (newPassword.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }
    const targetUserId = parseInt(userId);
    if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
    }
    // Find the target user
    const targetUser = await prisma_1.default.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    // Check if caller has admin access to at least one program the target user is in
    // Get programs where caller is admin
    const callerAdminPrograms = await prisma_1.default.programAssignment.findMany({
        where: { userId: caller.userId, role: 'admin' },
        select: { programId: true },
    });
    const callerProgramIds = callerAdminPrograms.map((p) => p.programId);
    // Check if target user is in any of those programs (via Staff or Delegate)
    const targetStaff = await prisma_1.default.staff.findFirst({
        where: {
            userId: targetUserId,
            programYear: { programId: { in: callerProgramIds } },
        },
    });
    const targetDelegate = await prisma_1.default.delegate.findFirst({
        where: {
            userId: targetUserId,
            programYear: { programId: { in: callerProgramIds } },
        },
    });
    if (!targetStaff && !targetDelegate) {
        res.status(403).json({ error: 'Forbidden: You can only reset passwords for users in programs you administer' });
        return;
    }
    // Hash new password
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const buf = (await scrypt(newPassword, salt, 64));
    const hashed = `${salt}:${buf.toString('hex')}`;
    await prisma_1.default.user.update({
        where: { id: targetUserId },
        data: { password: hashed },
    });
    logger.info('system', `Admin ${caller.email} reset password for user ${targetUser.email}`);
    res.json({ message: 'Password reset successfully' });
});
exports.default = router;
