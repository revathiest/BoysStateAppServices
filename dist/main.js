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
exports.loginAttempts = exports.swaggerDoc = void 0;
exports.getUserPrograms = getUserPrograms;
exports.ensureDatabase = ensureDatabase;
/* istanbul ignore file */
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yaml_1 = __importDefault(require("yaml"));
const crypto_1 = require("crypto");
const util_1 = require("util");
const prisma_1 = __importDefault(require("./prisma"));
const jwt_1 = require("./jwt");
const logger = __importStar(require("./logger"));
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const app = (0, express_1.default)();
// Configure CORS to allow credentialed requests
const corsOptions = {
    origin: true,
    credentials: true,
};
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((req, _res, next) => {
    const programId = req.user?.programId || 'system';
    logger.info(programId, `${req.method} ${req.path}`);
    next();
});
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
const loginAttempts = new Map();
exports.loginAttempts = loginAttempts;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
app.use((req, res, next) => {
    if (req.path === '/login' ||
        req.path === '/register' ||
        req.path.startsWith('/docs')) {
        return next();
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const token = auth.slice(7);
    try {
        req.user = (0, jwt_1.verify)(token, jwtSecret);
        next();
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
});
function ensureDatabase() {
    try {
        logger.info('system', 'Running database synchronization');
        (0, child_process_1.execSync)('npx prisma db push', { stdio: 'inherit' });
    }
    catch (err) {
        logger.error('system', 'Database synchronization failed', err);
    }
}
// Load OpenAPI spec
const openApiPath = path_1.default.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml_1.default.parse((0, fs_1.readFileSync)(openApiPath, 'utf8'));
app.get('/docs/swagger.json', (_req, res) => {
    res.json(openApiDoc);
});
// Override server URL when not in production so Swagger points to the local API
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    openApiDoc.servers = [{ url: `http://localhost:${port}` }];
}
app.get('/docs/swagger-ui-custom.js', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, 'swagger-ui-custom.js'));
});
const docsOptions = {
    customJs: 'swagger-ui-custom.js',
};
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openApiDoc, docsOptions));
exports.swaggerDoc = openApiDoc;
app.post('/register', async (req, res) => {
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
    return;
});
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
    }
    const now = Date.now();
    const ip = req.ip || '';
    const attempt = loginAttempts.get(ip);
    if (attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) {
        logger.warn('system', `Too many login attempts from ${ip}`);
        res.status(429).json({ error: 'Too many login attempts' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
        loginAttempts.set(ip, { count, lastAttempt: now });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const [salt, storedHash] = user.password.split(':');
    const buf = (await scrypt(password, salt, 64));
    if (buf.toString('hex') !== storedHash) {
        const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
        loginAttempts.set(ip, { count, lastAttempt: now });
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    loginAttempts.delete(ip);
    const token = (0, jwt_1.sign)({ userId: user.id, email: user.email }, jwtSecret);
    logger.info('system', `User logged in: ${email}`);
    res.json({ token });
    return;
});
app.get('/health', async (_req, res) => {
    logger.info('system', 'Serving /health');
    let dbStatus = 'ok';
    try {
        await prisma_1.default.$queryRaw `SELECT 1`;
    }
    catch (err) {
        logger.error('system', 'Database check failed', err);
        dbStatus = 'error';
    }
    res.json({ status: 'ok', database: dbStatus });
});
app.post('/logs', (req, res) => {
    const { programId, level, message, error, source } = req.body;
    if (!programId || !level || !message) {
        res.status(400).json({ error: 'programId, level, and message required' });
        return;
    }
    const lvl = level;
    if (!['debug', 'info', 'warn', 'error'].includes(lvl)) {
        res.status(400).json({ error: 'Invalid level' });
        return;
    }
    const src = source || 'client';
    switch (lvl) {
        case 'debug':
            logger.debug(programId, message, src);
            break;
        case 'info':
            logger.info(programId, message, src);
            break;
        case 'warn':
            logger.warn(programId, message, src);
            break;
        case 'error':
            logger.error(programId, message, error, src);
            break;
    }
    res.status(204).send();
});
app.get('/logs', async (req, res) => {
    const { programId, level, source, dateFrom, dateTo, search, page = '1', pageSize = '50', } = req.query;
    if (level && !['debug', 'info', 'warn', 'error'].includes(level)) {
        res.status(400).json({ error: 'Invalid level' });
        return;
    }
    let p = parseInt(page, 10);
    if (isNaN(p) || p < 1)
        p = 1;
    let size = parseInt(pageSize, 10);
    if (isNaN(size) || size < 1)
        size = 50;
    if (size > 100)
        size = 100;
    const where = {};
    if (programId)
        where.programId = programId;
    if (level)
        where.level = level;
    if (source)
        where.source = source;
    if (dateFrom || dateTo) {
        where.timestamp = {};
        if (dateFrom)
            where.timestamp.gte = new Date(dateFrom);
        if (dateTo)
            where.timestamp.lte = new Date(dateTo);
    }
    if (search) {
        const contains = { contains: search, mode: 'insensitive' };
        where.OR = [{ message: contains }, { error: contains }, { source: contains }];
    }
    const total = await prisma_1.default.log.count({ where });
    const logs = await prisma_1.default.log.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (p - 1) * size,
        take: size,
    });
    res.json({ logs, page: p, pageSize: size, total });
});
app.post('/audit-logs', async (req, res) => {
    const { tableName, recordId, userId, action, changes } = req.body;
    if (!tableName || recordId === undefined || !userId || !action) {
        res
            .status(400)
            .json({ error: 'tableName, recordId, userId and action required' });
        return;
    }
    const log = await prisma_1.default.auditLog.create({
        data: {
            tableName,
            recordId: String(recordId),
            userId,
            action,
            changes,
        },
    });
    res.status(201).json(log);
});
app.get('/audit-logs', async (req, res) => {
    const { tableName, recordId, userId, dateFrom, dateTo, page = '1', pageSize = '50', } = req.query;
    let p = parseInt(page, 10);
    if (isNaN(p) || p < 1)
        p = 1;
    let size = parseInt(pageSize, 10);
    if (isNaN(size) || size < 1)
        size = 50;
    if (size > 100)
        size = 100;
    const where = {};
    if (tableName)
        where.tableName = tableName;
    if (recordId)
        where.recordId = recordId;
    if (userId)
        where.userId = Number(userId);
    if (dateFrom || dateTo) {
        where.timestamp = {};
        if (dateFrom)
            where.timestamp.gte = new Date(dateFrom);
        if (dateTo)
            where.timestamp.lte = new Date(dateTo);
    }
    const total = await prisma_1.default.auditLog.count({ where });
    const logs = await prisma_1.default.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (p - 1) * size,
        take: size,
    });
    res.json({ auditLogs: logs, page: p, pageSize: size, total });
});
async function getUserPrograms(req, res) {
    const { username } = req.params;
    if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { email: username } });
    if (!user) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    const assignments = await prisma_1.default.programAssignment.findMany({
        where: { userId: user.id },
        include: { program: true },
    });
    const programs = assignments.map((a) => ({
        programId: a.program.id,
        programName: a.program.name,
        role: a.role,
    }));
    programs.forEach((p) => {
        logger.info(p.programId, `Program lookup for ${user.email}`);
    });
    res.json({ username: user.email, programs });
}
async function isProgramAdmin(userId, programId) {
    const assignment = await prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
    });
    return assignment?.role === 'admin';
}
async function isProgramMember(userId, programId) {
    const assignment = await prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
    });
    return Boolean(assignment);
}
app.post('/programs', async (req, res) => {
    const user = req.user;
    const { name, year, config } = req.body;
    if (!name || !year) {
        res.status(400).json({ error: 'name and year required' });
        return;
    }
    const program = await prisma_1.default.program.create({
        data: {
            name,
            year,
            config,
            createdBy: { connect: { id: user.userId } },
        },
    });
    await prisma_1.default.programAssignment.create({
        data: { userId: user.userId, programId: program.id, role: 'admin' },
    });
    logger.info(program.id, `Program created by ${user.email}`);
    res.status(201).json({
        id: program.id,
        name: program.name,
        year: program.year,
        createdBy: user.userId,
        roleAssigned: 'admin',
    });
});
app.get('/programs', async (_req, res) => {
    const programs = await prisma_1.default.program.findMany();
    res.json(programs);
});
app.post('/programs/:programId/users', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { userId, role } = req.body;
    if (!userId || !role) {
        res.status(400).json({ error: 'userId and role required' });
        return;
    }
    await prisma_1.default.programAssignment.create({
        data: { userId, programId, role },
    });
    logger.info(programId, `User ${userId} assigned role ${role}`);
    res.status(201).json({
        programId,
        userId,
        role,
        status: 'assigned',
    });
});
app.get('/programs/:programId/users', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const assignments = await prisma_1.default.programAssignment.findMany({
        where: { programId },
        select: { userId: true, role: true },
    });
    logger.info(programId, `Listed users for program`);
    res.json(assignments);
});
app.post('/programs/:programId/years', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { year, startDate, endDate, status, notes } = req.body;
    if (!year) {
        res.status(400).json({ error: 'year required' });
        return;
    }
    const py = await prisma_1.default.programYear.create({
        data: {
            programId,
            year,
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            status: status || 'active',
            notes,
        },
    });
    logger.info(programId, `Program year ${year} created`);
    res.status(201).json(py);
});
app.get('/programs/:programId/years', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const years = await prisma_1.default.programYear.findMany({
        where: { programId },
        orderBy: { year: 'desc' },
    });
    res.json(years);
});
app.get('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(py);
});
app.put('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { startDate, endDate, status, notes } = req.body;
    const updated = await prisma_1.default.programYear.update({
        where: { id: Number(id) },
        data: {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            status,
            notes,
        },
    });
    logger.info(py.programId, `Program year ${py.year} updated`);
    res.json(updated);
});
app.delete('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.programYear.update({
        where: { id: Number(id) },
        data: { status: 'archived' },
    });
    logger.info(py.programId, `Program year ${py.year} archived`);
    res.json(updated);
});
app.get('/user-programs/:username', getUserPrograms);
app.get('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const member = await isProgramMember(caller.userId, id);
    if (!member) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(program);
});
app.get('/programs/:id/branding', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const member = await isProgramMember(caller.userId, id);
    if (!member) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const branding = {
        brandingLogoUrl: program.brandingLogoUrl,
        brandingPrimaryColor: program.brandingPrimaryColor,
        brandingSecondaryColor: program.brandingSecondaryColor,
        welcomeMessage: program.welcomeMessage,
        contactEmail: program.contactEmail,
        contactPhone: program.contactPhone,
        socialLinks: program.socialLinks,
    };
    res.json(branding);
});
app.put('/programs/:id/branding', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, id);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { brandingLogoUrl, brandingPrimaryColor, brandingSecondaryColor, welcomeMessage, contactEmail, contactPhone, socialLinks, } = req.body;
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: {
            brandingLogoUrl,
            brandingPrimaryColor,
            brandingSecondaryColor,
            welcomeMessage,
            contactEmail,
            contactPhone,
            socialLinks,
        },
    });
    logger.info(id, `Branding updated by ${caller.email}`);
    res.json(updated);
});
app.put('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, id);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, year, config, status } = req.body;
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: { name, year, config, status },
    });
    logger.info(id, `Program updated by ${caller.email}`);
    res.json(updated);
});
app.delete('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, id);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: { status: 'retired' },
    });
    logger.info(id, `Program retired by ${caller.email}`);
    res.json(updated);
});
app.post('/programs/:programId/grouping-types', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { defaultName, customName, pluralName, levelOrder, isRequired, } = req.body;
    if (!defaultName || levelOrder === undefined) {
        res.status(400).json({ error: 'defaultName and levelOrder required' });
        return;
    }
    const gt = await prisma_1.default.groupingType.create({
        data: {
            programId,
            defaultName,
            customName,
            pluralName,
            levelOrder,
            isRequired: Boolean(isRequired),
            status: 'active',
        },
    });
    logger.info(programId, `GroupingType ${gt.id} created`);
    res.status(201).json(gt);
});
app.get('/programs/:programId/grouping-types', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const types = await prisma_1.default.groupingType.findMany({
        where: { programId },
        orderBy: { levelOrder: 'asc' },
    });
    res.json(types);
});
app.put('/grouping-types/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const gt = await prisma_1.default.groupingType.findUnique({ where: { id: Number(id) } });
    if (!gt) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { customName, pluralName, levelOrder, isRequired, status } = req.body;
    const updated = await prisma_1.default.groupingType.update({
        where: { id: Number(id) },
        data: {
            customName,
            pluralName,
            levelOrder,
            isRequired,
            status,
        },
    });
    logger.info(gt.programId, `GroupingType ${gt.id} updated`);
    res.json(updated);
});
app.delete('/grouping-types/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const gt = await prisma_1.default.groupingType.findUnique({ where: { id: Number(id) } });
    if (!gt) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.groupingType.update({
        where: { id: Number(id) },
        data: { status: 'retired' },
    });
    logger.info(gt.programId, `GroupingType ${gt.id} retired`);
    res.json(updated);
});
app.post('/programs/:programId/groupings', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { groupingTypeId, parentGroupingId, name, displayOrder, notes } = req.body;
    if (!groupingTypeId || !name) {
        res.status(400).json({ error: 'groupingTypeId and name required' });
        return;
    }
    const grouping = await prisma_1.default.grouping.create({
        data: {
            programId,
            groupingTypeId,
            parentGroupingId,
            name,
            displayOrder,
            notes,
            status: 'active',
        },
    });
    logger.info(programId, `Grouping ${grouping.id} created`);
    res.status(201).json(grouping);
});
app.get('/programs/:programId/groupings', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const groupings = await prisma_1.default.grouping.findMany({
        where: { programId },
        orderBy: { displayOrder: 'asc' },
    });
    res.json(groupings);
});
app.put('/groupings/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const grouping = await prisma_1.default.grouping.findUnique({ where: { id: Number(id) } });
    if (!grouping) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, displayOrder, notes, parentGroupingId, status } = req.body;
    const updated = await prisma_1.default.grouping.update({
        where: { id: Number(id) },
        data: { name, displayOrder, notes, parentGroupingId, status },
    });
    logger.info(grouping.programId, `Grouping ${grouping.id} updated`);
    res.json(updated);
});
app.delete('/groupings/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const grouping = await prisma_1.default.grouping.findUnique({ where: { id: Number(id) } });
    if (!grouping) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.grouping.update({
        where: { id: Number(id) },
        data: { status: 'retired' },
    });
    logger.info(grouping.programId, `Grouping ${grouping.id} retired`);
    res.json(updated);
});
app.post('/program-years/:id/groupings/activate', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { groupingIds } = req.body;
    if (!Array.isArray(groupingIds) || groupingIds.length === 0) {
        res.status(400).json({ error: 'groupingIds required' });
        return;
    }
    const records = await Promise.all(groupingIds.map((gid) => prisma_1.default.programYearGrouping.create({
        data: { programYearId: py.id, groupingId: gid, status: 'active' },
    })));
    logger.info(py.programId, `Activated ${records.length} groupings for PY ${py.year}`);
    res.status(201).json(records);
});
app.get('/program-years/:id/groupings', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const records = await prisma_1.default.programYearGrouping.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: { grouping: true },
    });
    res.json(records);
});
app.post('/programs/:programId/parties', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, abbreviation, color, icon, displayOrder } = req.body;
    if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
    }
    const party = await prisma_1.default.party.create({
        data: { programId, name, abbreviation, color, icon, displayOrder, status: 'active' },
    });
    logger.info(programId, `Party ${party.id} created`);
    res.status(201).json(party);
});
app.get('/programs/:programId/parties', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const parties = await prisma_1.default.party.findMany({
        where: { programId },
        orderBy: { displayOrder: 'asc' },
    });
    res.json(parties);
});
app.put('/parties/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const party = await prisma_1.default.party.findUnique({ where: { id: Number(id) } });
    if (!party) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, party.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, abbreviation, color, icon, displayOrder, status } = req.body;
    const updated = await prisma_1.default.party.update({
        where: { id: Number(id) },
        data: { name, abbreviation, color, icon, displayOrder, status },
    });
    logger.info(party.programId, `Party ${party.id} updated`);
    res.json(updated);
});
app.delete('/parties/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const party = await prisma_1.default.party.findUnique({ where: { id: Number(id) } });
    if (!party) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, party.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.party.update({
        where: { id: Number(id) },
        data: { status: 'retired' },
    });
    logger.info(party.programId, `Party ${party.id} retired`);
    res.json(updated);
});
app.post('/program-years/:id/parties/activate', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { partyIds } = req.body;
    if (!Array.isArray(partyIds) || partyIds.length === 0) {
        res.status(400).json({ error: 'partyIds required' });
        return;
    }
    const records = await Promise.all(partyIds.map((pid) => prisma_1.default.programYearParty.create({
        data: { programYearId: py.id, partyId: pid, status: 'active' },
    })));
    logger.info(py.programId, `Activated ${records.length} parties for PY ${py.year}`);
    res.status(201).json(records);
});
app.get('/program-years/:id/parties', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const records = await prisma_1.default.programYearParty.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: { party: true },
    });
    res.json(records);
});
app.post('/programs/:programId/positions', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, description, displayOrder } = req.body;
    if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
    }
    const position = await prisma_1.default.position.create({
        data: { programId, name, description, displayOrder, status: 'active' },
    });
    logger.info(programId, `Position ${position.id} created`);
    res.status(201).json(position);
});
app.get('/programs/:programId/positions', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const positions = await prisma_1.default.position.findMany({
        where: { programId },
        orderBy: { displayOrder: 'asc' },
    });
    res.json(positions);
});
app.put('/positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const position = await prisma_1.default.position.findUnique({ where: { id: Number(id) } });
    if (!position) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, position.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, description, displayOrder, status } = req.body;
    const updated = await prisma_1.default.position.update({
        where: { id: Number(id) },
        data: { name, description, displayOrder, status },
    });
    logger.info(position.programId, `Position ${position.id} updated`);
    res.json(updated);
});
app.delete('/positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const position = await prisma_1.default.position.findUnique({ where: { id: Number(id) } });
    if (!position) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, position.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.position.update({ where: { id: Number(id) }, data: { status: 'retired' } });
    logger.info(position.programId, `Position ${position.id} retired`);
    res.json(updated);
});
app.post('/program-years/:id/positions', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { positionId, delegateId } = req.body;
    if (!positionId) {
        res.status(400).json({ error: 'positionId required' });
        return;
    }
    const pypos = await prisma_1.default.programYearPosition.create({
        data: { programYearId: py.id, positionId, delegateId, status: 'active' },
    });
    logger.info(py.programId, `ProgramYearPosition ${pypos.id} created`);
    res.status(201).json(pypos);
});
app.get('/program-years/:id/positions', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const records = await prisma_1.default.programYearPosition.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: { position: true, delegate: true },
    });
    res.json(records);
});
app.put('/program-year-positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const record = await prisma_1.default.programYearPosition.findUnique({ where: { id: Number(id) } });
    if (!record) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { delegateId, status } = req.body;
    const updated = await prisma_1.default.programYearPosition.update({ where: { id: Number(id) }, data: { delegateId, status } });
    logger.info(py.programId, `ProgramYearPosition ${record.id} updated`);
    res.json(updated);
});
app.delete('/program-year-positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const record = await prisma_1.default.programYearPosition.findUnique({ where: { id: Number(id) } });
    if (!record) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.programYearPosition.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `ProgramYearPosition ${record.id} removed`);
    res.json(updated);
});
app.post('/program-years/:id/delegates', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId, groupingId, partyId } = req.body;
    if (!firstName || !lastName || !email || !groupingId) {
        res.status(400).json({ error: 'firstName, lastName, email and groupingId required' });
        return;
    }
    const delegate = await prisma_1.default.delegate.create({
        data: {
            programYearId: py.id,
            firstName,
            lastName,
            email,
            phone,
            userId,
            groupingId,
            partyId,
            status: 'active',
        },
    });
    logger.info(py.programId, `Delegate ${delegate.id} created`);
    res.status(201).json(delegate);
});
app.get('/program-years/:id/delegates', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const delegates = await prisma_1.default.delegate.findMany({ where: { programYearId: py.id } });
    res.json(delegates);
});
app.put('/delegates/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const delegate = await prisma_1.default.delegate.findUnique({ where: { id: Number(id) } });
    if (!delegate) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: delegate.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId, groupingId, partyId, status } = req.body;
    const updated = await prisma_1.default.delegate.update({
        where: { id: Number(id) },
        data: { firstName, lastName, email, phone, userId, groupingId, partyId, status },
    });
    logger.info(py.programId, `Delegate ${delegate.id} updated`);
    res.json(updated);
});
app.delete('/delegates/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const delegate = await prisma_1.default.delegate.findUnique({ where: { id: Number(id) } });
    if (!delegate) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: delegate.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.delegate.update({
        where: { id: Number(id) },
        data: { status: 'withdrawn' },
    });
    logger.info(py.programId, `Delegate ${delegate.id} withdrawn`);
    res.json(updated);
});
app.post('/program-years/:id/staff', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId, role, groupingId } = req.body;
    if (!firstName || !lastName || !email || !role) {
        res.status(400).json({ error: 'firstName, lastName, email and role required' });
        return;
    }
    const staff = await prisma_1.default.staff.create({
        data: {
            programYearId: py.id,
            firstName,
            lastName,
            email,
            phone,
            userId,
            role,
            groupingId,
            status: 'active',
        },
    });
    logger.info(py.programId, `Staff ${staff.id} created`);
    res.status(201).json(staff);
});
app.get('/program-years/:id/staff', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const staffList = await prisma_1.default.staff.findMany({ where: { programYearId: py.id } });
    res.json(staffList);
});
app.put('/staff/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const staff = await prisma_1.default.staff.findUnique({ where: { id: Number(id) } });
    if (!staff) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: staff.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId, role, groupingId, status } = req.body;
    const updated = await prisma_1.default.staff.update({
        where: { id: Number(id) },
        data: { firstName, lastName, email, phone, userId, role, groupingId, status },
    });
    logger.info(py.programId, `Staff ${staff.id} updated`);
    res.json(updated);
});
app.delete('/staff/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const staff = await prisma_1.default.staff.findUnique({ where: { id: Number(id) } });
    if (!staff) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: staff.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.staff.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `Staff ${staff.id} removed`);
    res.json(updated);
});
app.post('/program-years/:id/parents', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId } = req.body;
    if (!firstName || !lastName || !email) {
        res.status(400).json({ error: 'firstName, lastName, and email required' });
        return;
    }
    const parent = await prisma_1.default.parent.create({
        data: {
            programYearId: py.id,
            firstName,
            lastName,
            email,
            phone,
            userId,
            status: 'active',
        },
    });
    logger.info(py.programId, `Parent ${parent.id} created`);
    res.status(201).json(parent);
});
app.get('/program-years/:id/parents', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const parents = await prisma_1.default.parent.findMany({ where: { programYearId: py.id } });
    res.json(parents);
});
app.put('/parents/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const parent = await prisma_1.default.parent.findUnique({ where: { id: Number(id) } });
    if (!parent) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: parent.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { firstName, lastName, email, phone, userId, status } = req.body;
    const updated = await prisma_1.default.parent.update({
        where: { id: Number(id) },
        data: { firstName, lastName, email, phone, userId, status },
    });
    logger.info(py.programId, `Parent ${parent.id} updated`);
    res.json(updated);
});
app.delete('/parents/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const parent = await prisma_1.default.parent.findUnique({ where: { id: Number(id) } });
    if (!parent) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: parent.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.parent.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `Parent ${parent.id} removed`);
    res.json(updated);
});
app.post('/delegate-parent-links', async (req, res) => {
    const caller = req.user;
    const { delegateId, parentId, programYearId } = req.body;
    if (!delegateId || !parentId || !programYearId) {
        res.status(400).json({ error: 'delegateId, parentId and programYearId required' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const link = await prisma_1.default.delegateParentLink.create({
        data: { delegateId, parentId, programYearId, status: 'pending' },
    });
    logger.info(py.programId, `Link ${link.id} created`);
    res.status(201).json(link);
});
app.put('/delegate-parent-links/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const link = await prisma_1.default.delegateParentLink.findUnique({ where: { id: Number(id) } });
    if (!link) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: link.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { status } = req.body;
    const updated = await prisma_1.default.delegateParentLink.update({ where: { id: Number(id) }, data: { status } });
    logger.info(py.programId, `Link ${link.id} updated`);
    res.json(updated);
});
app.post('/program-years/:id/elections', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { positionId, groupingId, method, startTime, endTime } = req.body;
    if (!positionId || !groupingId || !method) {
        res.status(400).json({ error: 'positionId, groupingId and method required' });
        return;
    }
    const election = await prisma_1.default.election.create({
        data: {
            programYearId: py.id,
            positionId,
            groupingId,
            method,
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
            status: 'scheduled',
        },
    });
    logger.info(py.programId, `Election ${election.id} created`);
    res.status(201).json(election);
});
app.get('/program-years/:id/elections', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const elections = await prisma_1.default.election.findMany({ where: { programYearId: py.id } });
    res.json(elections);
});
app.put('/elections/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const election = await prisma_1.default.election.findUnique({ where: { id: Number(id) } });
    if (!election) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { status, startTime, endTime } = req.body;
    const updated = await prisma_1.default.election.update({
        where: { id: Number(id) },
        data: {
            status,
            startTime: startTime ? new Date(startTime) : undefined,
            endTime: endTime ? new Date(endTime) : undefined,
        },
    });
    logger.info(py.programId, `Election ${election.id} updated`);
    res.json(updated);
});
app.delete('/elections/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const election = await prisma_1.default.election.findUnique({ where: { id: Number(id) } });
    if (!election) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.election.update({ where: { id: Number(id) }, data: { status: 'archived' } });
    logger.info(py.programId, `Election ${election.id} removed`);
    res.json(updated);
});
app.post('/elections/:id/vote', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const election = await prisma_1.default.election.findUnique({ where: { id: Number(id) } });
    if (!election) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { candidateId, voterId, rank } = req.body;
    if (!candidateId || !voterId) {
        res.status(400).json({ error: 'candidateId and voterId required' });
        return;
    }
    const vote = await prisma_1.default.electionVote.create({
        data: { electionId: election.id, candidateDelegateId: candidateId, voterDelegateId: voterId, voteRank: rank },
    });
    logger.info(py.programId, `Vote ${vote.id} recorded`);
    res.status(201).json(vote);
});
app.get('/elections/:id/results', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const election = await prisma_1.default.election.findUnique({ where: { id: Number(id) } });
    if (!election) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await isProgramMember(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const votes = await prisma_1.default.electionVote.groupBy({
        by: ['candidateDelegateId'],
        where: { electionId: election.id },
        _count: true,
    });
    res.json({ results: votes });
});
if (process.env.NODE_ENV !== 'test') {
    ensureDatabase();
    app.listen(port, () => {
        logger.info('system', `Server listening on port ${port}`);
    });
}
exports.default = app;
