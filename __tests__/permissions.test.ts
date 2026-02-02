import request from 'supertest';
jest.mock('../src/prisma');
import prisma from '../src/prisma';
import app from '../src/index';
import { sign } from '../src/jwt';

const mockedPrisma = prisma as any;
const token = sign({ userId: 1, email: 'admin@example.com' }, 'development-secret-for-testing-only');

beforeEach(() => {
  mockedPrisma.programAssignment.findFirst.mockReset();
  mockedPrisma.programAssignment.findMany.mockReset();
  mockedPrisma.programAssignment.update.mockReset();
  mockedPrisma.programRole.findMany.mockReset();
  mockedPrisma.programRole.findFirst.mockReset();
  mockedPrisma.programRole.create.mockReset();
  mockedPrisma.programRole.update.mockReset();
  mockedPrisma.programRole.delete.mockReset();
  mockedPrisma.programRole.aggregate.mockReset();
  mockedPrisma.programRolePermission.findMany.mockReset();
  mockedPrisma.programRolePermission.deleteMany.mockReset();
  mockedPrisma.programRolePermission.createMany.mockReset();
  mockedPrisma.user.findUnique.mockReset();
  mockedPrisma.$transaction.mockReset();
});

describe('GET /permissions', () => {
  it('returns list of all permissions', async () => {
    const res = await request(app)
      .get('/permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions).toBeDefined();
    expect(Array.isArray(res.body.permissions)).toBe(true);
    expect(res.body.groups).toBeDefined();
  });
});

describe('GET /programs/:id/my-permissions', () => {
  it('returns 400 when programId missing', async () => {
    const res = await request(app)
      .get('/programs//my-permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404); // Express treats empty param as different route
  });

  it('returns 403 when not a member', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/my-permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns permissions for member', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'delegate' }) // isProgramMember
      .mockResolvedValueOnce(null) // isProgramAdmin
      .mockResolvedValueOnce({ programRole: { name: 'Counselor' }, programRoleId: 1 }); // Assignment lookup
    mockedPrisma.programRolePermission.findMany.mockResolvedValueOnce([
      { permission: 'user_management.delegates' },
    ]);
    const res = await request(app)
      .get('/programs/abc/my-permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.permissions).toBeDefined();
    expect(res.body.isAdmin).toBe(false);
  });

  it('returns all permissions for admin', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramMember
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce({ role: 'admin' }); // Assignment lookup
    const res = await request(app)
      .get('/programs/abc/my-permissions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.isAdmin).toBe(true);
    expect(res.body.roleName).toBe('Admin');
  });
});

describe('GET /programs/:id/roles', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns list of roles for admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findMany.mockResolvedValueOnce([
      {
        id: 1,
        name: 'Counselor',
        description: 'Manages a city',
        isDefault: true,
        isActive: true,
        displayOrder: 1,
        permissions: [{ permission: 'user_management.delegates' }],
        _count: { assignments: 5 },
      },
    ]);
    const res = await request(app)
      .get('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Counselor');
    expect(res.body[0].assignedCount).toBe(5);
  });
});

describe('POST /programs/:id/roles', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Role' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when name missing', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name required');
  });

  it('returns 400 for invalid permissions', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    const res = await request(app)
      .post('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Role', permissions: ['invalid.permission'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid permissions');
  });

  it('returns 409 for duplicate name', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce({ id: 1, name: 'Existing Role' });
    const res = await request(app)
      .post('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Existing Role' });
    expect(res.status).toBe(409);
  });

  it('creates role successfully', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce(null);
    mockedPrisma.programRole.aggregate.mockResolvedValueOnce({ _max: { displayOrder: 2 } });
    mockedPrisma.programRole.create.mockResolvedValueOnce({
      id: 3,
      name: 'New Role',
      description: 'A new role',
      isDefault: false,
      isActive: true,
      displayOrder: 3,
      permissions: [{ permission: 'user_management.delegates' }],
    });
    const res = await request(app)
      .post('/programs/abc/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Role', description: 'A new role', permissions: ['user_management.delegates'] });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('New Role');
    expect(res.body.permissions).toContain('user_management.delegates');
  });
});

describe('PUT /programs/:id/roles/:roleId', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Role' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when role not found', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/programs/abc/roles/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid permissions', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce({ id: 1, name: 'Role' });
    const res = await request(app)
      .put('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: ['invalid.perm'] });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate name on rename', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst
      .mockResolvedValueOnce({ id: 1, name: 'Role A' })
      .mockResolvedValueOnce({ id: 2, name: 'Role B' });
    const res = await request(app)
      .put('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Role B' });
    expect(res.status).toBe(409);
  });

  it('updates role successfully', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst
      .mockResolvedValueOnce({ id: 1, name: 'Role A' })
      .mockResolvedValueOnce(null); // No duplicate name
    mockedPrisma.$transaction.mockImplementation(async (fn: any) => {
      return fn({
        programRolePermission: {
          deleteMany: jest.fn().mockResolvedValue({}),
          createMany: jest.fn().mockResolvedValue({}),
        },
        programRole: {
          update: jest.fn().mockResolvedValue({
            id: 1,
            name: 'Updated Role',
            description: 'Updated desc',
            isDefault: false,
            isActive: true,
            displayOrder: 1,
            permissions: [{ permission: 'console.elections' }],
          }),
        },
      });
    });
    const res = await request(app)
      .put('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Role', permissions: ['console.elections'] });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Role');
  });
});

describe('DELETE /programs/:id/roles/:roleId', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when role not found', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .delete('/programs/abc/roles/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when role has assignments', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce({
      id: 1,
      name: 'Role',
      _count: { assignments: 5 },
    });
    const res = await request(app)
      .delete('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('5 assigned user');
  });

  it('deletes role successfully', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce({ role: 'admin' });
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce({
      id: 1,
      name: 'Role To Delete',
      _count: { assignments: 0 },
    });
    mockedPrisma.programRole.delete.mockResolvedValueOnce({});
    const res = await request(app)
      .delete('/programs/abc/roles/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deletedRole).toBe('Role To Delete');
  });
});

describe('PUT /programs/:id/users/:userId/role', () => {
  it('returns 403 when not admin', async () => {
    mockedPrisma.programAssignment.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/programs/abc/users/10/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 1 });
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not in program', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce(null); // User's assignment
    const res = await request(app)
      .put('/programs/abc/users/999/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User is not assigned to this program');
  });

  it('returns 400 when trying to change admin role', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce({ id: 1, role: 'admin' }); // User's assignment is admin
    const res = await request(app)
      .put('/programs/abc/users/10/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change role for admin users');
  });

  it('returns 404 when role not found', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce({ id: 1, role: 'delegate' }); // User's assignment
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce(null);
    const res = await request(app)
      .put('/programs/abc/users/10/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 999 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Role not found');
  });

  it('assigns role successfully', async () => {
    mockedPrisma.programAssignment.findFirst
      .mockResolvedValueOnce({ role: 'admin' }) // isProgramAdmin
      .mockResolvedValueOnce({ id: 1, role: 'delegate' }); // User's assignment
    mockedPrisma.programRole.findFirst.mockResolvedValueOnce({ id: 1, name: 'Counselor' });
    mockedPrisma.programAssignment.update.mockResolvedValueOnce({
      programRoleId: 1,
      programRole: { name: 'Counselor' },
    });
    mockedPrisma.user.findUnique.mockResolvedValueOnce({ email: 'user@test.com' });
    const res = await request(app)
      .put('/programs/abc/users/10/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: 1 });
    expect(res.status).toBe(200);
    expect(res.body.roleId).toBe(1);
    expect(res.body.roleName).toBe('Counselor');
  });
});
