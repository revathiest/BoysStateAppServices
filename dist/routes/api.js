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
router.post('/programs/:programId/grouping-types', async (req, res) => {
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
router.get('/programs/:programId/grouping-types', async (req, res) => {
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
    const types = await prisma_1.default.groupingType.findMany({
        where: { programId },
        orderBy: { levelOrder: 'asc' },
    });
    res.json(types);
});
router.put('/grouping-types/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const gt = await prisma_1.default.groupingType.findUnique({ where: { id: Number(id) } });
    if (!gt) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, gt.programId);
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
router.delete('/grouping-types/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const gt = await prisma_1.default.groupingType.findUnique({ where: { id: Number(id) } });
    if (!gt) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, gt.programId);
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
        orderBy: { displayOrder: 'asc' },
    });
    res.json(groupings);
});
router.put('/groupings/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const grouping = await prisma_1.default.grouping.findUnique({ where: { id: Number(id) } });
    if (!grouping) {
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
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
    const records = await Promise.all(partyIds.map((pid) => prisma_1.default.programYearParty.create({
        data: { programYearId: py.id, partyId: pid, status: 'active' },
    })));
    logger.info(py.programId, `Activated ${records.length} parties for PY ${py.year}`);
    res.status(201).json(records);
});
router.get('/program-years/:id/parties', async (req, res) => {
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
    const records = await prisma_1.default.programYearParty.findMany({
        where: { programYearId: py.id, status: 'active' },
        include: { party: true },
    });
    res.json(records);
});
router.post('/programs/:programId/positions', async (req, res) => {
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
router.get('/programs/:programId/positions', async (req, res) => {
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
    const positions = await prisma_1.default.position.findMany({
        where: { programId },
        orderBy: { displayOrder: 'asc' },
    });
    res.json(positions);
});
router.put('/positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const position = await prisma_1.default.position.findUnique({ where: { id: Number(id) } });
    if (!position) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, position.programId);
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
router.delete('/positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const position = await prisma_1.default.position.findUnique({ where: { id: Number(id) } });
    if (!position) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, position.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.position.update({ where: { id: Number(id) }, data: { status: 'retired' } });
    logger.info(position.programId, `Position ${position.id} retired`);
    res.json(updated);
});
router.post('/program-years/:id/positions', async (req, res) => {
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
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
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
        res.status(404).json({ error: 'Not found' });
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: record.programYearId } });
    if (!py) {
        res.status(404).json({ error: 'Not found' });
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
router.post('/program-years/:id/delegates', async (req, res) => {
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
router.get('/program-years/:id/delegates', async (req, res) => {
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
    const delegates = await prisma_1.default.delegate.findMany({ where: { programYearId: py.id } });
    res.json(delegates);
});
router.put('/delegates/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.delete('/delegates/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.post('/program-years/:id/staff', async (req, res) => {
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
router.get('/program-years/:id/staff', async (req, res) => {
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
    const staffList = await prisma_1.default.staff.findMany({ where: { programYearId: py.id } });
    res.json(staffList);
});
router.put('/staff/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.delete('/staff/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.staff.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `Staff ${staff.id} removed`);
    res.json(updated);
});
router.post('/program-years/:id/parents', async (req, res) => {
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
router.get('/program-years/:id/parents', async (req, res) => {
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
    const parents = await prisma_1.default.parent.findMany({ where: { programYearId: py.id } });
    res.json(parents);
});
router.put('/parents/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.delete('/parents/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.parent.update({ where: { id: Number(id) }, data: { status: 'inactive' } });
    logger.info(py.programId, `Parent ${parent.id} removed`);
    res.json(updated);
});
router.post('/delegate-parent-links', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.put('/delegate-parent-links/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { status } = req.body;
    const updated = await prisma_1.default.delegateParentLink.update({ where: { id: Number(id) }, data: { status } });
    logger.info(py.programId, `Link ${link.id} updated`);
    res.json(updated);
});
router.post('/program-years/:id/elections', async (req, res) => {
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
router.get('/program-years/:id/elections', async (req, res) => {
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
    const elections = await prisma_1.default.election.findMany({ where: { programYearId: py.id } });
    res.json(elections);
});
router.put('/elections/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
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
router.delete('/elections/:id', async (req, res) => {
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
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, py.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.election.update({ where: { id: Number(id) }, data: { status: 'archived' } });
    logger.info(py.programId, `Election ${election.id} removed`);
    res.json(updated);
});
router.post('/elections/:id/vote', async (req, res) => {
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
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
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
router.get('/elections/:id/results', async (req, res) => {
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
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
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
exports.default = router;
