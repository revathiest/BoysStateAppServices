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
// Create a program year
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
    const { year, startDate, endDate, status, notes, copyFromPreviousYear } = req.body;
    if (!year) {
        res.status(400).json({ error: 'year required' });
        return;
    }
    // Create the new program year
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
    // If copyFromPreviousYear is true, find most recent year and copy activations
    if (copyFromPreviousYear) {
        // Find the most recent program year (excluding the one we just created)
        const mostRecentYear = await prisma_1.default.programYear.findFirst({
            where: {
                programId,
                year: { lt: year } // Find years before the one we're creating
            },
            orderBy: { year: 'desc' },
            include: {
                groupings: true,
                parties: true,
                programYearPositions: true,
            },
        });
        if (mostRecentYear) {
            // Copy groupings
            if (mostRecentYear.groupings.length > 0) {
                await prisma_1.default.programYearGrouping.createMany({
                    data: mostRecentYear.groupings.map((g) => ({
                        programYearId: py.id,
                        groupingId: g.groupingId,
                        status: g.status,
                    })),
                });
            }
            // Copy parties
            if (mostRecentYear.parties.length > 0) {
                await prisma_1.default.programYearParty.createMany({
                    data: mostRecentYear.parties.map((p) => ({
                        programYearId: py.id,
                        partyId: p.partyId,
                        status: p.status,
                    })),
                });
            }
            // Copy positions
            if (mostRecentYear.programYearPositions.length > 0) {
                await prisma_1.default.programYearPosition.createMany({
                    data: mostRecentYear.programYearPositions.map((p) => ({
                        programYearId: py.id,
                        positionId: p.positionId,
                        groupingId: p.groupingId,
                        isElected: p.isElected,
                        status: p.status,
                    })),
                });
            }
            logger.info(programId, `Created program year ${year} by ${caller.email}, copied from ${mostRecentYear.year}: ${mostRecentYear.groupings.length} groupings, ${mostRecentYear.parties.length} parties, ${mostRecentYear.programYearPositions.length} positions`);
        }
        else {
            logger.info(programId, `Created program year ${year} by ${caller.email} (no previous year to copy from)`);
        }
    }
    else {
        logger.info(programId, `Created program year ${year} by ${caller.email}`);
    }
    res.status(201).json(py);
});
// List program years (returns years from Program, ProgramYear table, and Applications)
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
    // Get the program itself to include its base year
    const program = await prisma_1.default.program.findUnique({
        where: { id: programId },
        select: { year: true },
    });
    // Get years from ProgramYear table (explicitly managed years)
    const programYears = await prisma_1.default.programYear.findMany({
        where: { programId },
        select: { id: true, year: true },
    });
    // Get distinct years from applications (years with actual applications)
    const applications = await prisma_1.default.application.findMany({
        where: { programId, year: { not: null } },
        select: { year: true },
        distinct: ['year'],
    });
    // Create a map of year -> programYear id (if exists)
    const yearToProgramYearId = new Map();
    programYears.forEach(py => yearToProgramYearId.set(py.year, py.id));
    // Merge and deduplicate years from all sources (including program's base year)
    const yearSet = new Set();
    if (program?.year)
        yearSet.add(program.year);
    programYears.forEach(py => yearSet.add(py.year));
    applications.forEach(app => { if (app.year)
        yearSet.add(app.year); });
    // Sort descending and return with id when available
    const years = Array.from(yearSet).sort((a, b) => b - a);
    res.json(years.map(year => {
        const id = yearToProgramYearId.get(year);
        return id ? { id, year, programId } : { year, programId };
    }));
});
// Get a program year
router.get('/program-years/:id', async (req, res) => {
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
    res.json(py);
});
// Update a program year
router.put('/program-years/:id', async (req, res) => {
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
    logger.info(py.programId, `Updated program year ${py.year} by ${caller.email}`);
    res.json(updated);
});
// Archive a program year
router.delete('/program-years/:id', async (req, res) => {
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
    const updated = await prisma_1.default.programYear.update({
        where: { id: Number(id) },
        data: { status: 'archived' },
    });
    logger.info(py.programId, `Archived program year ${py.year} by ${caller.email}`);
    res.json(updated);
});
exports.default = router;
