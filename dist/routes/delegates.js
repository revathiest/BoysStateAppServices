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
router.post('/program-years/:id/delegates', async (req, res) => {
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
    const { firstName, lastName, email, phone, userId, groupingId, partyId } = req.body;
    if (!firstName || !lastName || !email) {
        res.status(400).json({ error: 'firstName, lastName and email required' });
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
        res.status(204).end();
        return;
    }
    const isMember = await (0, auth_1.isProgramMember)(caller.userId, py.programId);
    if (!isMember) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    // Parse query parameters for filtering, searching, and pagination
    const { search, groupingId, partyId, status, page = '1', pageSize = '50', sort = 'lastName', order = 'asc', } = req.query;
    // Build where clause
    const where = { programYearId: py.id };
    // Search by name or email (case-insensitive)
    if (search && search.trim()) {
        const searchTerm = search.trim();
        where.OR = [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
        ];
    }
    // Filter by grouping
    if (groupingId) {
        if (groupingId === 'unassigned') {
            where.groupingId = null;
        }
        else {
            where.groupingId = Number(groupingId);
        }
    }
    // Filter by party
    if (partyId) {
        if (partyId === 'unassigned') {
            where.partyId = null;
        }
        else {
            where.partyId = Number(partyId);
        }
    }
    // Filter by status
    if (status && status !== 'all') {
        where.status = status;
    }
    // Pagination
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize, 10) || 50));
    const skip = (pageNum - 1) * pageSizeNum;
    // Sorting - validate sort field
    const validSortFields = ['firstName', 'lastName', 'email', 'status', 'createdAt'];
    const sortField = validSortFields.includes(sort) ? sort : 'lastName';
    const sortOrder = order === 'desc' ? 'desc' : 'asc';
    // Get total count for pagination
    const total = await prisma_1.default.delegate.count({ where });
    // Fetch delegates with relations
    const delegates = await prisma_1.default.delegate.findMany({
        where,
        include: {
            grouping: {
                select: { id: true, name: true, groupingType: { select: { id: true, defaultName: true, customName: true } } },
            },
            party: {
                select: { id: true, party: { select: { id: true, name: true, abbreviation: true, color: true } } },
            },
        },
        orderBy: { [sortField]: sortOrder },
        skip,
        take: pageSizeNum,
    });
    res.json({
        delegates,
        total,
        page: pageNum,
        pageSize: pageSizeNum,
        totalPages: Math.ceil(total / pageSizeNum),
    });
});
router.put('/delegates/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const delegate = await prisma_1.default.delegate.findUnique({ where: { id: Number(id) } });
    if (!delegate) {
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: delegate.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: delegate.programYearId } });
    if (!py) {
        res.status(204).end();
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
exports.default = router;
