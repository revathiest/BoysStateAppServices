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
const express_1 = __importDefault(require("express"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yaml_1 = __importDefault(require("yaml"));
const prisma_1 = __importDefault(require("../prisma"));
const logger = __importStar(require("../logger"));
const router = express_1.default.Router();
const openApiPath = path_1.default.join(__dirname, '..', 'openapi.yaml');
const swaggerDoc = yaml_1.default.parse((0, fs_1.readFileSync)(openApiPath, 'utf8'));
exports.swaggerDoc = swaggerDoc;
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
    swaggerDoc.servers = [{ url: `http://localhost:${port}` }];
}
router.get('/docs/swagger.json', (_req, res) => {
    res.json(swaggerDoc);
});
router.get('/docs/swagger-ui-custom.js', (_req, res) => {
    res.sendFile(path_1.default.join(__dirname, '..', 'swagger-ui-custom.js'));
});
router.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDoc, { customJs: 'swagger-ui-custom.js' }));
router.get('/health', async (_req, res) => {
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
router.post('/logs', (req, res) => {
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
router.get('/logs', async (req, res) => {
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
router.post('/audit-logs', async (req, res) => {
    const { tableName, recordId, userId, action, changes } = req.body;
    if (!tableName || recordId === undefined || !userId || !action) {
        res.status(400).json({ error: 'tableName, recordId, userId and action required' });
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
router.get('/audit-logs', async (req, res) => {
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
exports.default = router;
