"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma = {
    $queryRaw: jest.fn(),
    user: {
        create: jest.fn(),
        findUnique: jest.fn(),
    },
};
exports.default = prisma;
