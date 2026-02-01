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
    const { defaultName, customName, pluralName, levelOrder, isRequired } = req.body;
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
        res.status(204).end();
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
        data: { customName, pluralName, levelOrder, isRequired, status },
    });
    logger.info(gt.programId, `GroupingType ${gt.id} updated`);
    res.json(updated);
});
router.delete('/grouping-types/:id', async (req, res) => {
    const { id } = req.params;
    const caller = req.user;
    const gt = await prisma_1.default.groupingType.findUnique({ where: { id: Number(id) } });
    if (!gt) {
        res.status(204).end();
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
exports.default = router;
