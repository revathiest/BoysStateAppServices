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
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const router = express_1.default.Router();
exports.loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
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
    const token = (0, jwt_1.sign)({ userId: user.id, email: user.email }, jwtSecret);
    logger.info('system', `User logged in: ${email}`);
    res.json({ token });
});
exports.default = router;
