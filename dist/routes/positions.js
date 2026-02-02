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
    const { name, description, displayOrder, groupingTypeId, ballotGroupingTypeId, isElected, isNonPartisan, seatCount, requiresDeclaration, requiresPetition, petitionSignatures, electionMethod } = req.body;
    if (!name) {
        res.status(400).json({ error: 'name required' });
        return;
    }
    // Validate electionMethod if provided
    const validMethods = ['plurality', 'majority', 'ranked'];
    if (electionMethod && !validMethods.includes(electionMethod)) {
        res.status(400).json({ error: 'Invalid electionMethod. Must be plurality, majority, or ranked.' });
        return;
    }
    const position = await prisma_1.default.position.create({
        data: {
            programId,
            name,
            description,
            displayOrder,
            groupingTypeId,
            ballotGroupingTypeId: isElected ? (ballotGroupingTypeId ?? groupingTypeId) : null,
            isElected: isElected ?? false,
            isNonPartisan: isElected ? (isNonPartisan ?? false) : false,
            seatCount: seatCount ?? 1,
            requiresDeclaration: isElected ? (requiresDeclaration ?? false) : false,
            requiresPetition: isElected ? (requiresPetition ?? false) : false,
            petitionSignatures: isElected && requiresPetition ? petitionSignatures : null,
            electionMethod: isElected ? (electionMethod || null) : null,
            status: 'active'
        },
    });
    logger.info(programId, `Created position "${position.name}" (id: ${position.id}) by ${caller.email}`);
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
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, position.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, description, displayOrder, status, groupingTypeId, ballotGroupingTypeId, isElected, isNonPartisan, seatCount, requiresDeclaration, requiresPetition, petitionSignatures, electionMethod } = req.body;
    // Validate electionMethod if provided (allow null to clear)
    const validMethods = ['plurality', 'majority', 'ranked'];
    if (electionMethod !== undefined && electionMethod !== null && !validMethods.includes(electionMethod)) {
        res.status(400).json({ error: 'Invalid electionMethod. Must be plurality, majority, or ranked.' });
        return;
    }
    // For elected positions, set ballotGroupingTypeId (default to groupingTypeId if not provided)
    // For appointed positions, clear ballotGroupingTypeId
    const resolvedBallotGroupingTypeId = isElected
        ? (ballotGroupingTypeId ?? groupingTypeId ?? position.groupingTypeId)
        : null;
    // These fields only apply to elected positions
    const resolvedIsNonPartisan = isElected ? (isNonPartisan ?? false) : false;
    const resolvedRequiresDeclaration = isElected ? (requiresDeclaration ?? false) : false;
    const resolvedRequiresPetition = isElected ? (requiresPetition ?? false) : false;
    const resolvedPetitionSignatures = isElected && resolvedRequiresPetition ? petitionSignatures : null;
    // electionMethod only applies to elected positions; null means use program default
    const resolvedElectionMethod = isElected ? (electionMethod === undefined ? position.electionMethod : (electionMethod || null)) : null;
    const updated = await prisma_1.default.position.update({
        where: { id: Number(id) },
        data: {
            name,
            description,
            displayOrder,
            status,
            groupingTypeId,
            ballotGroupingTypeId: resolvedBallotGroupingTypeId,
            isElected,
            isNonPartisan: resolvedIsNonPartisan,
            seatCount,
            requiresDeclaration: resolvedRequiresDeclaration,
            requiresPetition: resolvedRequiresPetition,
            petitionSignatures: resolvedPetitionSignatures,
            electionMethod: resolvedElectionMethod,
        },
    });
    logger.info(position.programId, `Updated position "${updated.name}" (id: ${position.id}) by ${caller.email}`);
    res.json(updated);
});
router.delete('/positions/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const position = await prisma_1.default.position.findUnique({ where: { id: Number(id) } });
    if (!position) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, position.programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.position.update({
        where: { id: Number(id) },
        data: { status: 'retired' },
    });
    logger.info(position.programId, `Retired position "${position.name}" (id: ${position.id}) by ${caller.email}`);
    res.json(updated);
});
exports.default = router;
