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
const permissions_1 = require("../utils/permissions");
const router = express_1.default.Router();
// Create a program and assign the creator as admin
router.post('/programs', async (req, res) => {
    const user = req.user;
    const { name, year } = req.body;
    if (!name || !year) {
        res.status(400).json({ error: 'name and year required' });
        return;
    }
    const program = await prisma_1.default.program.create({
        data: {
            name,
            year,
            createdBy: { connect: { id: user.userId } },
        },
    });
    // Create the initial ProgramYear record for the program's base year
    await prisma_1.default.programYear.create({
        data: {
            programId: program.id,
            year,
            status: 'active',
        },
    });
    await prisma_1.default.programAssignment.create({
        data: { userId: user.userId, programId: program.id, role: 'admin' },
    });
    // Create default roles for the program
    for (const roleConfig of permissions_1.DEFAULT_ROLES) {
        const role = await prisma_1.default.programRole.create({
            data: {
                programId: program.id,
                name: roleConfig.name,
                description: roleConfig.description,
                isDefault: roleConfig.isDefault,
                displayOrder: roleConfig.displayOrder,
            },
        });
        // Add permissions for the role
        if (roleConfig.permissions.length > 0) {
            await prisma_1.default.programRolePermission.createMany({
                data: roleConfig.permissions.map(permission => ({
                    roleId: role.id,
                    permission,
                })),
            });
        }
    }
    logger.info(program.id, `Created program "${program.name}" (year: ${year}) with default roles by ${user.email}`);
    res.status(201).json({
        id: program.id,
        name: program.name,
        year: program.year,
        createdBy: user.userId,
        roleAssigned: 'admin',
    });
});
// List all programs
router.get('/programs', async (_req, res) => {
    const programs = await prisma_1.default.program.findMany();
    res.json(programs);
});
// Assign a user to a program
router.post('/programs/:programId/users', async (req, res) => {
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
    const { userId, role } = req.body;
    if (!userId || !role) {
        res.status(400).json({ error: 'userId and role required' });
        return;
    }
    await prisma_1.default.programAssignment.create({
        data: { userId, programId, role },
    });
    logger.info(programId, `Assigned user ${userId} to role "${role}" by ${caller.email}`);
    res.status(201).json({
        programId,
        userId,
        role,
        status: 'assigned',
    });
});
// List users for a program
router.get('/programs/:programId/users', async (req, res) => {
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
    const assignments = await prisma_1.default.programAssignment.findMany({
        where: { programId },
        select: { userId: true, role: true },
    });
    logger.info(programId, `Listed ${assignments.length} user assignments by ${caller.email}`);
    res.json(assignments);
});
// Get programs for a user
router.get('/user-programs/:username', auth_1.getUserPrograms);
// Get program details
router.get('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(204).end();
        return;
    }
    const member = await (0, auth_1.isProgramMember)(caller.userId, id);
    if (!member) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    res.json(program);
});
// Update program fields
router.put('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, id);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { name, year, status, defaultVotingMethod } = req.body;
    // Validate voting method if provided
    if (defaultVotingMethod && !['plurality', 'majority', 'ranked'].includes(defaultVotingMethod)) {
        res.status(400).json({ error: 'Invalid voting method. Must be plurality, majority, or ranked' });
        return;
    }
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: { name, year, status, defaultVotingMethod },
    });
    logger.info(id, `Updated program "${updated.name}" by ${caller.email}`);
    res.json(updated);
});
// Retire a program
router.delete('/programs/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const program = await prisma_1.default.program.findUnique({ where: { id } });
    if (!program) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, id);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const updated = await prisma_1.default.program.update({
        where: { id },
        data: { status: 'retired' },
    });
    logger.info(id, `Retired program "${program.name}" by ${caller.email}`);
    res.json(updated);
});
exports.default = router;
