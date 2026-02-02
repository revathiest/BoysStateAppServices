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
router.post('/programs/:programId/groupings', async (req, res) => {
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
router.get('/programs/:programId/groupings', async (req, res) => {
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
    const groupings = await prisma_1.default.grouping.findMany({
        where: { programId },
        include: { groupingType: true },
        orderBy: [
            { groupingType: { levelOrder: 'asc' } },
            { displayOrder: 'asc' },
            { name: 'asc' },
        ],
    });
    res.json(groupings);
});
router.put('/groupings/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const grouping = await prisma_1.default.grouping.findUnique({ where: { id: Number(id) } });
    if (!grouping) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, grouping.programId);
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
router.delete('/groupings/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const grouping = await prisma_1.default.grouping.findUnique({ where: { id: Number(id) } });
    if (!grouping) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, grouping.programId);
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
router.post('/program-years/:id/groupings/activate', async (req, res) => {
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
    const { groupingIds } = req.body;
    if (!Array.isArray(groupingIds) || groupingIds.length === 0) {
        res.status(400).json({ error: 'groupingIds required' });
        return;
    }
    // Delete existing activations for this program year
    await prisma_1.default.programYearGrouping.deleteMany({
        where: { programYearId: py.id },
    });
    // Create new activations
    const records = await Promise.all(groupingIds.map((gid) => prisma_1.default.programYearGrouping.create({
        data: { programYearId: py.id, groupingId: gid, status: 'active' },
    })));
    logger.info(py.programId, `Activated ${records.length} groupings for PY ${py.year}`);
    res.status(201).json(records);
});
router.get('/program-years/:id/groupings', async (req, res) => {
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
    const records = await prisma_1.default.programYearGrouping.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: {
            grouping: {
                include: { groupingType: true },
            },
        },
    });
    res.json(records);
});
exports.default = router;
