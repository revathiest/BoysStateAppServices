const prisma = {
  $queryRaw: jest.fn(),
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  programAssignment: {
    findMany: jest.fn(),
  },
  log: {
    create: jest.fn().mockResolvedValue(null),
  },
};

export default prisma;
