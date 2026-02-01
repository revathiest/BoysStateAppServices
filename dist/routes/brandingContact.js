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
async function saveBrandingContact(req, res) {
    const { programId } = req.params;
    const caller = req.user;
    /* istanbul ignore next */
    /* istanbul ignore next */
    /* istanbul ignore next */
    /* c8 ignore next */
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    /* istanbul ignore next */
    /* istanbul ignore next */
    /* c8 ignore next */
    if (!program) {
        res.status(204).end();
        return;
    }
    const admin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    /* istanbul ignore next */
    /* c8 ignore next */
    if (!admin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const { welcomeMessage, branding, colors, contact, changeReason, } = req.body;
    const data = {
        programId,
        welcomeMessage,
        logoUrl: branding?.logoUrl,
        iconUrl: branding?.iconUrl,
        bannerUrl: branding?.bannerUrl,
        colorPrimary: colors?.primary,
        colorSecondary: colors?.secondary,
        colorBackground: colors?.background,
        contactEmail: contact?.email,
        contactPhone: contact?.phone,
        contactWebsite: contact?.website,
        contactFacebook: contact?.facebook,
    };
    const existing = await prisma_1.default.programBrandingContact.findFirst({
        where: { programId },
    });
    let record;
    let changeType;
    if (existing) {
        record = await prisma_1.default.programBrandingContact.update({
            where: { id: existing.id },
            data,
        });
        changeType = 'update';
    }
    else {
        record = await prisma_1.default.programBrandingContact.create({ data });
        changeType = 'create';
    }
    await prisma_1.default.programBrandingContactAudit.create({
        data: {
            brandingContactId: record.id,
            programId,
            programName: program.name,
            welcomeMessage: record.welcomeMessage ?? undefined,
            logoUrl: record.logoUrl ?? undefined,
            iconUrl: record.iconUrl ?? undefined,
            bannerUrl: record.bannerUrl ?? undefined,
            colorPrimary: record.colorPrimary ?? undefined,
            colorSecondary: record.colorSecondary ?? undefined,
            colorBackground: record.colorBackground ?? undefined,
            contactEmail: record.contactEmail ?? undefined,
            contactPhone: record.contactPhone ?? undefined,
            contactWebsite: record.contactWebsite ?? undefined,
            contactFacebook: record.contactFacebook ?? undefined,
            updatedAt: record.updatedAt,
            createdAt: record.createdAt,
            changeType,
            changedByUserId: caller.userId,
            changeReason,
        },
    });
    logger.info(programId, `Branding/contact ${changeType}d by ${caller.email}`);
    res.status(existing ? 200 : 201).json({ ...record, programName: program.name });
}
router.post('/api/branding-contact/:programId', saveBrandingContact);
router.put('/api/branding-contact/:programId', saveBrandingContact);
router.get('/api/branding-contact/:programId', async (req, res) => {
    const { programId } = req.params;
    const caller = req.user;
    /* c8 ignore next */
    if (!programId) {
        res.status(400).json({ error: 'programId required' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    /* c8 ignore next */
    if (!program) {
        res.status(204).end();
        return;
    }
    const member = await (0, auth_1.isProgramMember)(caller.userId, programId);
    /* istanbul ignore next */
    /* c8 ignore next */
    if (!member) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const record = await prisma_1.default.programBrandingContact.findFirst({
        where: { programId },
    });
    /* istanbul ignore next */
    /* c8 ignore next */
    if (!record) {
        res.status(204).end();
        return;
    }
    res.json({ ...record, programName: program.name });
});
exports.default = router;
