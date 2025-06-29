"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma = {
    $queryRaw: jest.fn(),
    user: {
        findUnique: jest.fn(),
        create: jest.fn(),
    },
};
exports.default = prisma;
