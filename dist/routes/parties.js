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
router.post('/programs/:programId/parties', async (req, res) => {
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
router.get('/programs/:programId/parties', async (req, res) => {
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
    const parties = await prisma_1.default.party.findMany({
        where: { programId },
        orderBy: { displayOrder: 'asc' },
    });
    res.json(parties);
});
router.put('/parties/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const party = await prisma_1.default.party.findUnique({ where: { id: Number(id) } });
    if (!party) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, party.programId);
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
router.delete('/parties/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const party = await prisma_1.default.party.findUnique({ where: { id: Number(id) } });
    if (!party) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, party.programId);
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
router.post('/program-years/:id/parties/activate', async (req, res) => {
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
    const { partyIds } = req.body;
    if (!Array.isArray(partyIds) || partyIds.length === 0) {
        res.status(400).json({ error: 'partyIds required' });
        return;
    }
    // Check for existing records and only create new ones
    const existingRecords = await prisma_1.default.programYearParty.findMany({
        where: { programYearId: py.id, partyId: { in: partyIds } },
    });
    const existingPartyIds = new Set(existingRecords.map(r => r.partyId));
    // Reactivate any retired records
    const toReactivate = existingRecords.filter(r => r.status !== 'active');
    if (toReactivate.length > 0) {
        await prisma_1.default.programYearParty.updateMany({
            where: { id: { in: toReactivate.map(r => r.id) } },
            data: { status: 'active' },
        });
    }
    // Create only new records (parties not already linked to this year)
    const newPartyIds = partyIds.filter(pid => !existingPartyIds.has(pid));
    const newRecords = await Promise.all(newPartyIds.map((pid) => prisma_1.default.programYearParty.create({
        data: { programYearId: py.id, partyId: pid, status: 'active' },
    })));
    const records = [...existingRecords.filter(r => r.status === 'active'), ...toReactivate, ...newRecords];
    logger.info(py.programId, `Activated ${records.length} parties for PY ${py.year}`);
    res.status(201).json(records);
});
router.get('/program-years/:id/parties', async (req, res) => {
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
    const records = await prisma_1.default.programYearParty.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: { party: true },
    });
    res.json(records);
});
exports.default = router;
