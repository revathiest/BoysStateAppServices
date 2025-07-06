const prisma = {
  $queryRaw: jest.fn(),
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  programAssignment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  program: {
    create: jest.fn(),
  },
  programYear: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  log: {
    create: jest.fn().mockResolvedValue(null),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

export default prisma;
