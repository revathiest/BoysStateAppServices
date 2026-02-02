jest.mock('../src/prisma');
import prisma from '../src/prisma';
import { isProgramAdmin, isProgramMember, getUserPermissions, hasPermission, getUserRoleAssignment } from '../src/utils/auth';

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

describe('getUserPermissions', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  it('returns empty array when no assignment', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const result = await getUserPermissions(1, 'abc');
    expect(result).toEqual([]);
  });

  it('returns all permissions for admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({
      role: 'admin',
      programRole: null,
    });
    const result = await getUserPermissions(1, 'abc');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('user_management.delegates');
  });

  it('returns permissions from programRole', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({
      role: 'staff',
      programRole: {
        permissions: [
          { permission: 'user_management.delegates' },
          { permission: 'console.elections' },
        ],
      },
    });
    const result = await getUserPermissions(1, 'abc');
    expect(result).toEqual(['user_management.delegates', 'console.elections']);
  });

  it('returns empty array when no programRole', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({
      role: 'delegate',
      programRole: null,
    });
    const result = await getUserPermissions(1, 'abc');
    expect(result).toEqual([]);
  });
});

describe('hasPermission', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  it('returns true when permission exists', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({
      role: 'staff',
      programRole: {
        permissions: [{ permission: 'user_management.delegates' }],
      },
    });
    const result = await hasPermission(1, 'abc', 'user_management.delegates');
    expect(result).toBe(true);
  });

  it('returns false when permission not found', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({
      role: 'staff',
      programRole: {
        permissions: [{ permission: 'user_management.delegates' }],
      },
    });
    const result = await hasPermission(1, 'abc', 'console.elections');
    expect(result).toBe(false);
  });
});

describe('getUserRoleAssignment', () => {
  beforeEach(() => {
    mockedPrisma.programAssignment.findFirst.mockReset();
  });

  it('returns assignment with role details', async () => {
    const mockAssignment = {
      id: 1,
      userId: 1,
      programId: 'abc',
      role: 'staff',
      programRole: {
        id: 1,
        name: 'Counselor',
        permissions: [{ permission: 'delegates:read' }],
      },
    };
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(mockAssignment);
    const result = await getUserRoleAssignment(1, 'abc');
    expect(result).toEqual(mockAssignment);
  });

  it('returns null when no assignment', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const result = await getUserRoleAssignment(1, 'abc');
    expect(result).toBeNull();
  });
});
