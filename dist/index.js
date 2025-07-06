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
app.get('/programs/:username', getUserPrograms);
if (process.env.NODE_ENV !== 'test') {
    ensureDatabase();
    app.listen(port, () => {
        logger.info('system', `Server listening on port ${port}`);
    });
}
exports.default = app;
