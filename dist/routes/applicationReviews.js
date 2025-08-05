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
const express_1 = __importDefault(require("express"));
const prisma_1 = __importDefault(require("../prisma"));
const logger = __importStar(require("../logger"));
const auth_1 = require("../utils/auth");
const router = express_1.default.Router();
function listHandler(appType) {
    return async (req, res) => {
        const { programId } = req.params;
        const { status = 'pending', year } = req.query;
        const caller = req.user;
        const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
        if (!program) {
            res.status(204).end();
            return;
        }
        const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
        if (!isAdmin) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const responses = await prisma_1.default.applicationResponse.findMany({
            where: {
                status: status,
                application: {
                    programId,
                    type: appType,
                    ...(year ? { year: Number(year) } : {}),
                },
            },
        });
        res.json(responses);
    };
}
router.get('/api/programs/:programId/applications/delegate', listHandler('delegate'));
router.get('/api/programs/:programId/applications/staff', listHandler('staff'));
router.get('/api/programs/:programId/applications/:type/:applicationId', async (req, res) => {
    const { programId, type, applicationId } = req.params;
    const caller = req.user;
    if (!['delegate', 'staff'].includes(type)) {
        res.status(400).json({ error: 'Invalid type' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    if (!program) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const response = await prisma_1.default.applicationResponse.findFirst({
        where: { id: applicationId, application: { programId, type } },
        include: { answers: true },
    });
    if (!response) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    res.json(response);
});
function decisionHandler(decision) {
    return async (req, res) => {
        const { programId, type, applicationId } = req.params;
        const caller = req.user;
        if (!['delegate', 'staff'].includes(type)) {
            res.status(400).json({ error: 'Invalid type' });
            return;
        }
        const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
        if (!program) {
            res.status(204).end();
            return;
        }
        const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
        if (!isAdmin) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const response = await prisma_1.default.applicationResponse.findFirst({
            where: { id: applicationId, application: { programId, type } },
        });
        if (!response) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        if (response.status !== 'pending') {
            res.status(400).json({ error: 'Already decided' });
            return;
        }
        await prisma_1.default.applicationResponse.update({
            where: { id: applicationId },
            data: { status: decision === 'accept' ? 'accepted' : 'rejected' },
        });
        const comment = req.body?.comment || req.body?.reason;
        await prisma_1.default.auditLog.create({
            data: {
                tableName: 'ApplicationResponse',
                recordId: applicationId,
                userId: caller.userId,
                action: decision,
                ...(comment ? { changes: { comment } } : {}),
            },
        });
        logger.info(programId, `Application ${applicationId} ${decision}ed by ${caller.userId}`);
        res.json({ success: true });
    };
}
router.post('/api/programs/:programId/applications/:type/:applicationId/accept', decisionHandler('accept'));
router.post('/api/programs/:programId/applications/:type/:applicationId/reject', decisionHandler('reject'));
exports.default = router;
