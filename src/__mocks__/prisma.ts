const prisma = {
  $queryRaw: jest.fn(),
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
  },
};

export default prisma;
