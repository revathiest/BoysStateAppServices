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
router.post('/program-years/:id/parents', async (req, res) => {
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
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: parent.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: parent.programYearId } });
    if (!py) {
        res.status(204).end();
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
        res.status(204).end();
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
        res.status(204).end();
        return;
    }
    const py = await prisma_1.default.programYear.findUnique({ where: { id: link.programYearId } });
    if (!py) {
        res.status(204).end();
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
exports.default = router;
