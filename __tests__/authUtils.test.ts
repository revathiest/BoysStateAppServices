jest.mock('../src/prisma');
import prisma from '../src/prisma';
import { isProgramAdmin, isProgramMember } from '../src/utils/auth';

const mockedPrisma = prisma as any;

describe('auth utils', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  it('isProgramAdmin true when role admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const result = await isProgramAdmin(1, 'abc');
    expect(result).toBe(true);
  });

  it('isProgramAdmin false when other role', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const result = await isProgramAdmin(1, 'abc');
    expect(result).toBe(false);
  });

  it('isProgramMember true when assignment exists', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'delegate' });
    const result = await isProgramMember(1, 'abc');
    expect(result).toBe(true);
  });

  it('isProgramMember false when none', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const result = await isProgramMember(1, 'abc');
    expect(result).toBe(false);
  });
});
