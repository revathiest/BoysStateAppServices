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
router.post('/programs/:programId/years', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
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
router.get('/programs/:programId/years', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, programId);
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
router.get('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(py);
});
router.put('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.delete('/program-years/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const py = await prisma_1.default.programYear.findUnique({ where: { id: Number(id) } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
exports.default = router;
