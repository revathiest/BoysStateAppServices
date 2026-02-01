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
const crypto_1 = require("crypto");
const util_1 = require("util");
const prisma_1 = __importDefault(require("../prisma"));
const logger = __importStar(require("../logger"));
const auth_1 = require("../utils/auth");
const email_1 = require("../email");
const scrypt = (0, util_1.promisify)(crypto_1.scrypt);
const router = express_1.default.Router();
// Generate a random temporary password
function generateTempPassword() {
    return (0, crypto_1.randomBytes)(12).toString('base64').replace(/[+/=]/g, 'x');
}
// Hash a password using scrypt (same as auth.ts)
async function hashPassword(password) {
    const salt = (0, crypto_1.randomBytes)(16).toString('hex');
    const buf = (await scrypt(password, salt, 64));
    return `${salt}:${buf.toString('hex')}`;
}
// Create or find a user account for the applicant
async function createUserAccount(email, programId, role, staffRole) {
    logger.info(programId, `[USER ACCOUNT] Looking up user by email: "${email}"`);
    // Check if user already exists
    const existingUser = await prisma_1.default.user.findUnique({ where: { email } });
    if (existingUser) {
        logger.info(programId, `[USER ACCOUNT] Found existing user: id=${existingUser.id}, email="${existingUser.email}"`);
        // User exists - check if they already have a program assignment
        const existingAssignment = await prisma_1.default.programAssignment.findFirst({
            where: { userId: existingUser.id, programId },
        });
        // For staff, ensure they have a program assignment for web portal access
        if (role === 'staff' && !existingAssignment) {
            await prisma_1.default.programAssignment.create({
                data: {
                    userId: existingUser.id,
                    programId,
                    role: staffRole || 'staff',
                },
            });
        }
        logger.info(programId, `[USER ACCOUNT] Returning existing user (isNew=false, NO tempPassword)`);
        return { userId: existingUser.id, isNew: false };
    }
    logger.info(programId, `[USER ACCOUNT] No existing user found, creating new user...`);
    // Create new user with temporary password
    const tempPassword = generateTempPassword();
    const hashedPassword = await hashPassword(tempPassword);
    const newUser = await prisma_1.default.user.create({
        data: {
            email,
            password: hashedPassword,
        },
    });
    logger.info(programId, `[USER ACCOUNT] Created new user: id=${newUser.id}, tempPassword generated`);
    // For staff, create a program assignment for web portal access
    // Delegates don't get a program assignment (mobile app only)
    if (role === 'staff') {
        await prisma_1.default.programAssignment.create({
            data: {
                userId: newUser.id,
                programId,
                role: staffRole || 'staff',
            },
        });
        logger.info(programId, `[USER ACCOUNT] Created program assignment for staff`);
    }
    logger.info(programId, `[USER ACCOUNT] Returning new user (isNew=true, tempPassword="${tempPassword.substring(0, 4)}****")`);
    return { userId: newUser.id, isNew: true, tempPassword };
}
function listHandler(appType) {
    return async (req, res) => {
        const { programId } = req.params;
        const { status = 'pending', year } = req.query;
        const caller = req.user;
        const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
        if (!program) {
            res.status(204).end();
            return;
        }
        const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
        if (!isAdmin) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const whereClause = {
            status: status,
            application: {
                programId,
                type: appType,
                ...(year ? { year: Number(year) } : {}),
            },
        };
        const responses = await prisma_1.default.applicationResponse.findMany({
            where: whereClause,
            include: {
                application: true,
                answers: {
                    include: {
                        question: true,
                    },
                },
            },
        });
        // Transform responses to include year and extract name/role from answers
        const transformedResponses = responses.map((response) => {
            // Find first name and last name fields (should always be first two questions)
            const firstNameAnswer = response.answers.find((a) => a.question.text === 'First Name' || a.question.text.toLowerCase() === 'first name');
            const lastNameAnswer = response.answers.find((a) => a.question.text === 'Last Name' || a.question.text.toLowerCase() === 'last name');
            const firstName = firstNameAnswer?.value
                ? typeof firstNameAnswer.value === 'string'
                    ? firstNameAnswer.value
                    : firstNameAnswer.value?.toString() || ''
                : '';
            const lastName = lastNameAnswer?.value
                ? typeof lastNameAnswer.value === 'string'
                    ? lastNameAnswer.value
                    : lastNameAnswer.value?.toString() || ''
                : '';
            // Combine first and last name
            const name = `${firstName} ${lastName}`.trim() ||
                // Fallback to old "Full Name" field for legacy applications
                response.answers.find(a => a.question.text === 'Full Name' || a.question.text.toLowerCase().includes('full name'))?.value?.toString() || '';
            // Find role field (for staff applications)
            const roleAnswer = response.answers.find((a) => a.question.text.toLowerCase().includes('role') ||
                a.question.text.toLowerCase().includes('position'));
            const role = roleAnswer?.value
                ? typeof roleAnswer.value === 'string'
                    ? roleAnswer.value
                    : roleAnswer.value?.toString() || ''
                : '';
            return {
                id: response.id,
                name,
                fullName: name,
                role: appType === 'staff' ? role : undefined,
                year: response.application.year,
                status: response.status,
                submittedAt: response.createdAt,
            };
        });
        res.json(transformedResponses);
    };
}
router.get('/api/programs/:programId/applications/delegate', listHandler('delegate'));
router.get('/api/programs/:programId/applications/staff', listHandler('staff'));
router.get('/api/programs/:programId/applications/:type/:applicationId', async (req, res) => {
    const { programId, type, applicationId } = req.params;
    const caller = req.user;
    if (!['delegate', 'staff'].includes(type)) {
        res.status(400).json({ error: 'Invalid type' });
        return;
    }
    const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
    if (!program) {
        res.status(204).end();
        return;
    }
    const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
    if (!isAdmin) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    const response = await prisma_1.default.applicationResponse.findFirst({
        where: { id: applicationId, application: { programId, type } },
        include: {
            application: true,
            answers: {
                include: {
                    question: true,
                },
            },
        },
    });
    if (!response) {
        res.status(404).json({ error: 'Not found' });
        return;
    }
    // Transform answers into a more usable format
    const formattedAnswers = response.answers.map((answer) => ({
        questionId: answer.questionId,
        label: answer.question.text,
        type: answer.question.type,
        value: answer.value,
        answer: answer.value,
    }));
    // Extract name and role for convenience
    // Name should be First Name + Last Name (first two questions)
    const firstNameAnswer = response.answers.find((a) => a.question.text === 'First Name' || a.question.text.toLowerCase() === 'first name');
    const lastNameAnswer = response.answers.find((a) => a.question.text === 'Last Name' || a.question.text.toLowerCase() === 'last name');
    const firstName = firstNameAnswer?.value
        ? typeof firstNameAnswer.value === 'string'
            ? firstNameAnswer.value
            : firstNameAnswer.value?.toString() || ''
        : '';
    const lastName = lastNameAnswer?.value
        ? typeof lastNameAnswer.value === 'string'
            ? lastNameAnswer.value
            : lastNameAnswer.value?.toString() || ''
        : '';
    // Combine first and last name
    const name = `${firstName} ${lastName}`.trim() ||
        // Fallback to old "Full Name" field for legacy applications
        response.answers.find(a => a.question.text === 'Full Name' || a.question.text.toLowerCase().includes('full name'))?.value?.toString() || '';
    const roleAnswer = response.answers.find((a) => a.question.text.toLowerCase().includes('role') ||
        a.question.text.toLowerCase().includes('position'));
    const role = roleAnswer?.value
        ? typeof roleAnswer.value === 'string'
            ? roleAnswer.value
            : roleAnswer.value?.toString() || ''
        : '';
    res.json({
        id: response.id,
        name,
        fullName: name,
        role: type === 'staff' ? role : undefined,
        year: response.application.year,
        status: response.status,
        submittedAt: response.createdAt,
        answers: formattedAnswers,
    });
});
// Helper to extract answer value from application answers
// First tries exact match, then falls back to partial match (contains)
function extractAnswerValue(answers, ...fieldNames) {
    // First try exact match (case-insensitive)
    for (const fieldName of fieldNames) {
        const answer = answers.find((a) => a.question.text.toLowerCase() === fieldName.toLowerCase());
        if (answer?.value) {
            return typeof answer.value === 'string'
                ? answer.value
                : answer.value?.toString() || '';
        }
    }
    // Fallback: try partial match (field name contains the search term)
    for (const fieldName of fieldNames) {
        const answer = answers.find((a) => a.question.text.toLowerCase().includes(fieldName.toLowerCase()));
        if (answer?.value) {
            return typeof answer.value === 'string'
                ? answer.value
                : answer.value?.toString() || '';
        }
    }
    return '';
}
function decisionHandler(decision) {
    return async (req, res) => {
        const { programId, type, applicationId } = req.params;
        const caller = req.user;
        try {
            if (!['delegate', 'staff'].includes(type)) {
                res.status(400).json({ error: 'Invalid type' });
                return;
            }
            const program = await prisma_1.default.program.findUnique({ where: { id: programId } });
            if (!program) {
                res.status(204).end();
                return;
            }
            const isAdmin = await (0, auth_1.isProgramAdmin)(caller.userId, programId);
            if (!isAdmin) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }
            // Include answers for extracting applicant info when accepting
            const response = await prisma_1.default.applicationResponse.findFirst({
                where: { id: applicationId, application: { programId, type } },
                include: {
                    application: true,
                    answers: {
                        include: {
                            question: true,
                        },
                    },
                },
            });
            if (!response) {
                res.status(404).json({ error: 'Not found' });
                return;
            }
            if (response.status !== 'pending') {
                res.status(400).json({ error: 'Already decided' });
                return;
            }
            // For staff acceptance, require role in request body
            const { role, comment, reason } = (req.body || {});
            if (decision === 'accept' && type === 'staff' && !role) {
                res.status(400).json({ error: 'Role is required when accepting staff applications' });
                return;
            }
            // If accepting, create the Delegate or Staff record
            let createdRecordId = null;
            let userAccountInfo = null;
            if (decision === 'accept') {
                // Extract applicant info from answers
                const firstName = extractAnswerValue(response.answers, 'First Name');
                const lastName = extractAnswerValue(response.answers, 'Last Name');
                const email = extractAnswerValue(response.answers, 'Email', 'Email Address');
                const phone = extractAnswerValue(response.answers, 'Phone', 'Phone Number');
                if (!firstName || !lastName || !email) {
                    res.status(400).json({
                        error: 'Application is missing required fields (First Name, Last Name, Email)',
                    });
                    return;
                }
                // Find or create the ProgramYear for this application
                const applicationYear = response.application.year;
                logger.info(programId, `Application year: ${applicationYear}, Application ID: ${response.application.id}`);
                if (!applicationYear) {
                    logger.error(programId, 'Application has no year specified');
                    res.status(400).json({ error: 'Application has no year specified' });
                    return;
                }
                let programYear = await prisma_1.default.programYear.findFirst({
                    where: { programId, year: applicationYear },
                });
                logger.info(programId, `Found existing programYear: ${programYear ? `id=${programYear.id}` : 'none'}`);
                if (!programYear) {
                    // Create the program year if it doesn't exist
                    programYear = await prisma_1.default.programYear.create({
                        data: {
                            programId,
                            year: applicationYear,
                            status: 'active',
                        },
                    });
                    logger.info(programId, `Auto-created program year ${applicationYear} (id: ${programYear.id}) for application acceptance`);
                }
                else {
                    logger.info(programId, `Using existing program year ${applicationYear} (id: ${programYear.id})`);
                }
                if (type === 'delegate') {
                    // Create user account for mobile app access (no web portal)
                    userAccountInfo = await createUserAccount(email, programId, 'delegate');
                    // Create delegate with no grouping assignment (for random assignment later)
                    const delegate = await prisma_1.default.delegate.create({
                        data: {
                            programYearId: programYear.id,
                            firstName,
                            lastName,
                            email,
                            phone: phone || null,
                            userId: userAccountInfo.userId,
                            status: 'pending_assignment',
                        },
                    });
                    createdRecordId = delegate.id;
                    logger.info(programId, `Created delegate "${firstName} ${lastName}" (id: ${delegate.id}, userId: ${userAccountInfo.userId}) from application by ${caller.email}`);
                }
                else {
                    // Create staff with the provided role
                    // Create user account for web portal access
                    userAccountInfo = await createUserAccount(email, programId, 'staff', role);
                    try {
                        const staff = await prisma_1.default.staff.create({
                            data: {
                                programYearId: programYear.id,
                                firstName,
                                lastName,
                                email,
                                phone: phone || null,
                                userId: userAccountInfo.userId,
                                role: role,
                                status: 'active',
                            },
                        });
                        createdRecordId = staff.id;
                        logger.info(programId, `Created staff "${firstName} ${lastName}" as ${role} (id: ${staff.id}, userId: ${userAccountInfo.userId}) from application by ${caller.email}`);
                    }
                    catch (staffCreateError) {
                        throw staffCreateError;
                    }
                }
                // Send acceptance email (don't block on failure)
                const programName = program.name || 'Boys State';
                (0, email_1.sendAcceptanceEmail)(programId, email, firstName, lastName, programName, applicationYear, type, role, userAccountInfo?.tempPassword).catch((err) => {
                    logger.warn(programId, `Failed to send acceptance email to ${email}: ${err.message}`);
                });
            }
            // Update application status
            await prisma_1.default.applicationResponse.update({
                where: { id: applicationId },
                data: { status: decision === 'accept' ? 'accepted' : 'rejected' },
            });
            const auditComment = comment || reason;
            await prisma_1.default.auditLog.create({
                data: {
                    tableName: 'ApplicationResponse',
                    recordId: applicationId,
                    userId: caller.userId,
                    action: decision,
                    changes: {
                        ...(auditComment ? { comment: auditComment } : {}),
                        ...(createdRecordId ? { createdRecordId, recordType: type } : {}),
                    },
                },
            });
            const applicantName = extractAnswerValue(response.answers, 'First Name') + ' ' + extractAnswerValue(response.answers, 'Last Name');
            logger.info(programId, `${decision === 'accept' ? 'Accepted' : 'Rejected'} ${type} application from "${applicantName.trim()}" by ${caller.email}`);
            const responsePayload = {
                success: true,
                ...(createdRecordId ? { [`${type}Id`]: createdRecordId } : {}),
                ...(userAccountInfo ? {
                    userAccount: {
                        userId: userAccountInfo.userId,
                        isNew: userAccountInfo.isNew,
                        // Include temp password so it can be communicated to the user
                        // In production, you would email this instead of returning it
                        ...(userAccountInfo.tempPassword ? { tempPassword: userAccountInfo.tempPassword } : {}),
                    },
                } : {}),
            };
            res.json(responsePayload);
        }
        catch (error) {
            logger.error(programId, `Error in ${decision} handler: ${error.message}`, error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    };
}
router.post('/api/programs/:programId/applications/:type/:applicationId/accept', decisionHandler('accept'));
router.post('/api/programs/:programId/applications/:type/:applicationId/reject', decisionHandler('reject'));
exports.default = router;
