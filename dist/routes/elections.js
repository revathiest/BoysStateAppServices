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
router.post('/program-years/:id/elections', async (req, res) => {
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
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: election.programYearId } });
    if (!py) {
        res.status(204).end();
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
