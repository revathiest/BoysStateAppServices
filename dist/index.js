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
exports.swaggerDoc = void 0;
exports.getUserPrograms = getUserPrograms;
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
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use((req, _res, next) => {
    const programId = req.user?.programId || 'system';
    logger.info(programId, `${req.method} ${req.path}`);
    next();
});
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
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
// Override server URL when not in production so Swagger points to the local API
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    openApiDoc.servers = [{ url: `http://localhost:${port}` }];
}
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openApiDoc));
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
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const [salt, storedHash] = user.password.split(':');
    const buf = (await scrypt(password, salt, 64));
    if (buf.toString('hex') !== storedHash) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
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
app.get('/programs/:username', getUserPrograms);
if (process.env.NODE_ENV !== 'test') {
    ensureDatabase();
    app.listen(port, () => {
        logger.info('system', `Server listening on port ${port}`);
    });
}
exports.default = app;
