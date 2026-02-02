"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProgramAdmin = isProgramAdmin;
exports.isProgramMember = isProgramMember;
exports.getUserPrograms = getUserPrograms;
exports.getUserPermissions = getUserPermissions;
exports.hasPermission = hasPermission;
exports.getUserRoleAssignment = getUserRoleAssignment;
const prisma_1 = __importDefault(require("../prisma"));
const permissions_1 = require("./permissions");
async function isProgramAdmin(userId, programId) {
    const assignment = await prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
    });
    return assignment?.role === 'admin';
}
async function isProgramMember(userId, programId) {
    const assignment = await prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
    });
    return Boolean(assignment);
}
async function getUserPrograms(req, res) {
    const { username } = req.params;
    if (!username) {
        res.status(400).json({ error: 'Username required' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { email: username } });
    if (!user) {
        res.status(204).end();
        return;
    }
    const assignments = await prisma_1.default.programAssignment.findMany({
        where: { userId: user.id },
        include: { program: true },
    });
    let programs = assignments.map((a) => ({
        programId: a.program.id,
        programName: a.program.name,
        role: a.role,
    }));
    const hasDevProgram = assignments.some((a) => a.program.name === 'DEVELOPMENT');
    if (hasDevProgram) {
        const allPrograms = await prisma_1.default.program.findMany();
        programs = allPrograms.map((prog) => {
            const assigned = assignments.find((a) => a.program.id === prog.id);
            return {
                programId: prog.id,
                programName: prog.name,
                role: assigned ? assigned.role : 'developer',
            };
        });
    }
    res.json({ username: user.email, programs });
}
/**
 * Get all permissions for a user in a specific program.
 * Admins get all permissions automatically.
 * Other users get permissions from their assigned ProgramRole.
 */
async function getUserPermissions(userId, programId) {
    const assignment = await prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
        include: {
            programRole: {
                include: {
                    permissions: true,
                },
            },
        },
    });
    if (!assignment) {
        return [];
    }
    // Admins get all permissions
    if (assignment.role === 'admin') {
        return [...permissions_1.ALL_PERMISSIONS];
    }
    // If user has a programRole, return its permissions
    if (assignment.programRole) {
        return assignment.programRole.permissions.map((p) => p.permission);
    }
    // No role assigned = no permissions
    return [];
}
/**
 * Check if a user has a specific permission in a program.
 */
async function hasPermission(userId, programId, permission) {
    const permissions = await getUserPermissions(userId, programId);
    return permissions.includes(permission);
}
/**
 * Get a user's role assignment for a program, including role details.
 */
async function getUserRoleAssignment(userId, programId) {
    return prisma_1.default.programAssignment.findFirst({
        where: { userId, programId },
        include: {
            programRole: {
                include: {
                    permissions: true,
                },
            },
        },
    });
}
