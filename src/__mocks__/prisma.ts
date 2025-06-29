const prisma = {
  $queryRaw: jest.fn(),
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

export default prisma;
