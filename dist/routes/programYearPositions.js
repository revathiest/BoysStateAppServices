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
router.post('/program-years/:id/positions', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.get('/program-years/:id/positions', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(204).end();
        return;
    }
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
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
router.put('/program-year-positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const record = await prisma_1.default.programYearPosition.findUnique({ where: { id: Number(id) } });
    if (!record) {
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { delegateId, status } = req.body;
    const updated = await prisma_1.default.programYearPosition.update({ where: { id: Number(id) }, data: { delegateId, status } });
    logger.info(py.programId, `ProgramYearPosition ${record.id} updated`);
    res.json(updated);
});
router.delete('/program-year-positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const record = await prisma_1.default.programYearPosition.findUnique({ where: { id: Number(id) } });
    if (!record) {
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.programYearPosition.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `ProgramYearPosition ${record.id} removed`);
    res.json(updated);
});
exports.default = router;
