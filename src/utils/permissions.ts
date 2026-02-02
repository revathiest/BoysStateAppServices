// Permission constants and default roles for the Boys State App

// Permission keys - code-defined for type safety
export const PERMISSIONS = {
  // Console page cards
  CONSOLE_USER_MANAGEMENT: 'console.user_management',
  CONSOLE_PROGRAM_CREATE: 'console.program_create',
  CONSOLE_PROGRAM_CONFIG: 'console.program_config',
  CONSOLE_CONTENT_MANAGEMENT: 'console.content_management',
  CONSOLE_ELECTIONS: 'console.elections',
  CONSOLE_AUDIT_LOGS: 'console.audit_logs',

  // User Management page cards
  USER_MANAGEMENT_APPLICATION_REVIEW: 'user_management.application_review',
  USER_MANAGEMENT_DELEGATES: 'user_management.delegates',
  USER_MANAGEMENT_STAFF: 'user_management.staff',
  USER_MANAGEMENT_PARENTS: 'user_management.parents',
  USER_MANAGEMENT_BULK_OPERATIONS: 'user_management.bulk_operations',

  // Program Config page cards
  PROGRAM_CONFIG_BRANDING: 'program_config.branding',
  PROGRAM_CONFIG_APPLICATION: 'program_config.application',
  PROGRAM_CONFIG_GROUPINGS: 'program_config.groupings',
  PROGRAM_CONFIG_PARTIES: 'program_config.parties',
  PROGRAM_CONFIG_POSITIONS: 'program_config.positions',
  PROGRAM_CONFIG_EMAIL_SERVER: 'program_config.email_server',
  PROGRAM_CONFIG_EMAIL_TEMPLATES: 'program_config.email_templates',
  PROGRAM_CONFIG_YEARS: 'program_config.years',
  PROGRAM_CONFIG_ELECTION_SETTINGS: 'program_config.election_settings',
  PROGRAM_CONFIG_ROLES: 'program_config.roles',
} as const;

// All permissions as array for validation and admin role
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// Permission type
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Permission groups for UI organization
// Note: console.user_management and console.program_config are not included here
// because their visibility is derived from having any child permissions.
// They are navigation cards, not actual features.
export const PERMISSION_GROUPS = {
  console: {
    label: 'Console Access',
    description: 'Direct access to console features',
    permissions: [
      { key: PERMISSIONS.CONSOLE_PROGRAM_CREATE, label: 'Register New Program' },
      { key: PERMISSIONS.CONSOLE_CONTENT_MANAGEMENT, label: 'Content Management' },
      { key: PERMISSIONS.CONSOLE_ELECTIONS, label: 'Elections' },
      { key: PERMISSIONS.CONSOLE_AUDIT_LOGS, label: 'Audit Logs' },
    ],
  },
  user_management: {
    label: 'User Management',
    description: 'Access to user management features (automatically shows User Management card on console)',
    permissions: [
      { key: PERMISSIONS.USER_MANAGEMENT_APPLICATION_REVIEW, label: 'Application Review' },
      { key: PERMISSIONS.USER_MANAGEMENT_DELEGATES, label: 'Delegates' },
      { key: PERMISSIONS.USER_MANAGEMENT_STAFF, label: 'Staff' },
      { key: PERMISSIONS.USER_MANAGEMENT_PARENTS, label: 'Parents' },
      { key: PERMISSIONS.USER_MANAGEMENT_BULK_OPERATIONS, label: 'Bulk Operations' },
    ],
  },
  program_config: {
    label: 'Program Configuration',
    description: 'Access to program configuration features (automatically shows Program Config card on console)',
    permissions: [
      { key: PERMISSIONS.PROGRAM_CONFIG_BRANDING, label: 'Branding & Contact' },
      { key: PERMISSIONS.PROGRAM_CONFIG_APPLICATION, label: 'Application Configuration' },
      { key: PERMISSIONS.PROGRAM_CONFIG_GROUPINGS, label: 'Groupings' },
      { key: PERMISSIONS.PROGRAM_CONFIG_PARTIES, label: 'Parties' },
      { key: PERMISSIONS.PROGRAM_CONFIG_POSITIONS, label: 'Positions' },
      { key: PERMISSIONS.PROGRAM_CONFIG_EMAIL_SERVER, label: 'Email Server' },
      { key: PERMISSIONS.PROGRAM_CONFIG_EMAIL_TEMPLATES, label: 'Email Templates' },
      { key: PERMISSIONS.PROGRAM_CONFIG_YEARS, label: 'Program Years' },
      { key: PERMISSIONS.PROGRAM_CONFIG_ELECTION_SETTINGS, label: 'Election Settings' },
      { key: PERMISSIONS.PROGRAM_CONFIG_ROLES, label: 'Roles & Permissions' },
    ],
  },
};

// Default roles created when a new program is created
export interface DefaultRoleConfig {
  name: string;
  description: string;
  permissions: string[];
  isDefault: boolean;
  displayOrder: number;
}

// Default roles created when a new program is created
// Note: Parent navigation permissions (console.user_management, console.program_config)
// are not needed - parent card visibility is derived from having any child permissions.
export const DEFAULT_ROLES: DefaultRoleConfig[] = [
  {
    name: 'Admin',
    description: 'Full access to all features',
    permissions: ALL_PERMISSIONS,
    isDefault: true,
    displayOrder: 1,
  },
  {
    name: 'Program Director',
    description: 'Manage program configuration and users',
    permissions: [
      PERMISSIONS.CONSOLE_ELECTIONS,
      PERMISSIONS.CONSOLE_AUDIT_LOGS,
      PERMISSIONS.USER_MANAGEMENT_APPLICATION_REVIEW,
      PERMISSIONS.USER_MANAGEMENT_DELEGATES,
      PERMISSIONS.USER_MANAGEMENT_STAFF,
      PERMISSIONS.USER_MANAGEMENT_PARENTS,
      PERMISSIONS.USER_MANAGEMENT_BULK_OPERATIONS,
      PERMISSIONS.PROGRAM_CONFIG_BRANDING,
      PERMISSIONS.PROGRAM_CONFIG_APPLICATION,
      PERMISSIONS.PROGRAM_CONFIG_GROUPINGS,
      PERMISSIONS.PROGRAM_CONFIG_PARTIES,
      PERMISSIONS.PROGRAM_CONFIG_POSITIONS,
      PERMISSIONS.PROGRAM_CONFIG_YEARS,
      PERMISSIONS.PROGRAM_CONFIG_ELECTION_SETTINGS,
    ],
    isDefault: true,
    displayOrder: 2,
  },
  {
    name: 'Counselor',
    description: 'View and manage delegates in assigned grouping',
    permissions: [
      PERMISSIONS.USER_MANAGEMENT_DELEGATES,
    ],
    isDefault: true,
    displayOrder: 3,
  },
  {
    name: 'Registration Staff',
    description: 'Review applications and manage registrations',
    permissions: [
      PERMISSIONS.USER_MANAGEMENT_APPLICATION_REVIEW,
      PERMISSIONS.USER_MANAGEMENT_DELEGATES,
      PERMISSIONS.USER_MANAGEMENT_BULK_OPERATIONS,
    ],
    isDefault: true,
    displayOrder: 4,
  },
];

// Validate if a permission key is valid
export function isValidPermission(permission: string): boolean {
  return ALL_PERMISSIONS.includes(permission as Permission);
}

// Validate an array of permissions, return invalid ones
export function getInvalidPermissions(permissions: string[]): string[] {
  return permissions.filter(p => !isValidPermission(p));
}
