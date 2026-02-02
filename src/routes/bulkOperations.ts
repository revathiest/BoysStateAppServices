import express from 'express';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from '../prisma';
import * as logger from '../logger';
import { isProgramAdmin } from '../utils/auth';
import { sendAcceptanceEmail } from '../email';

const scrypt = promisify(_scrypt);
const router = express.Router();

// Generate a random temporary password
function generateTempPassword(): string {
  return randomBytes(8).toString('base64').replace(/[+/=]/g, '').substring(0, 12);
}

// Hash a password
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

// CSV template for delegates (includes optional parent info)
const DELEGATE_TEMPLATE_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'parentFirstName',
  'parentLastName',
  'parentEmail',
  'parentPhone',
];

// CSV template for staff
const STAFF_TEMPLATE_HEADERS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'role',
  'groupingName',
];

// Valid staff roles
const VALID_STAFF_ROLES = ['administrator', 'counselor', 'coordinator', 'volunteer'];

// Download CSV template
router.get('/programs/:programId/bulk/template/:type', async (req, res) => {
  const { programId, type } = req.params as { programId: string; type: string };
  const caller = (req as any).user as { userId: number };

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (type !== 'delegates' && type !== 'staff') {
    res.status(400).json({ error: 'Type must be "delegates" or "staff"' });
    return;
  }

  const headers = type === 'delegates' ? DELEGATE_TEMPLATE_HEADERS : STAFF_TEMPLATE_HEADERS;

  // Get groupings and parties for reference
  const groupings = await prisma.grouping.findMany({
    where: { programId, status: 'active' },
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  const parties = await prisma.party.findMany({
    where: { programId, status: 'active' },
    select: { name: true },
    orderBy: { name: 'asc' },
  });

  // Build CSV content with header row and example/comment rows
  let csv = headers.join(',') + '\n';

  // Add comment row with valid values reference
  if (type === 'delegates') {
    csv += '# DELEGATE: firstName, lastName, email required; phone optional\n';
    csv += '# PARENT: All parent fields are optional. If parentEmail is provided, parentFirstName and parentLastName are required\n';
    csv += '#\n';
    csv += '# Example (delegate only): John,Doe,john.doe@email.com,555-123-4567,,,,\n';
    csv += '# Example (with parent):   John,Doe,john.doe@email.com,555-123-4567,Jane,Doe,jane.doe@email.com,555-987-6543\n';
    csv += '#\n';
    csv += '# --- Enter your data below this line ---\n';
  } else {
    csv += `# Valid groupings: ${groupings.map((g) => g.name).join(', ') || 'None defined'}\n`;
    csv += `# Valid roles: ${VALID_STAFF_ROLES.join(', ')}\n`;
    csv += '#\n';
    csv += '# Example: Jane,Smith,jane.smith@email.com,555-987-6543,counselor,\n';
    csv += '#\n';
    csv += '# --- Enter your data below this line ---\n';
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-template.csv`);
  res.send(csv);
});

// Get valid values for dropdowns (groupings, parties, roles)
router.get('/programs/:programId/bulk/options/:type', async (req, res) => {
  const { programId, type } = req.params as { programId: string; type: string };
  const caller = (req as any).user as { userId: number };

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const groupings = await prisma.grouping.findMany({
    where: { programId, status: 'active' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const parties = await prisma.party.findMany({
    where: { programId, status: 'active' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  res.json({
    groupings,
    parties,
    roles: VALID_STAFF_ROLES,
  });
});

// Parse CSV content
function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));

  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index].trim();
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Validate import data
interface ValidationResult {
  valid: boolean;
  errors: { row: number; field: string; message: string }[];
  warnings: { row: number; field: string; message: string }[];
}

function validateDelegateRow(
  row: Record<string, string>,
  rowIndex: number,
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // Required delegate fields
  if (!row.firstName?.trim()) {
    errors.push({ row: rowIndex, field: 'firstName', message: 'Delegate first name is required' });
  }
  if (!row.lastName?.trim()) {
    errors.push({ row: rowIndex, field: 'lastName', message: 'Delegate last name is required' });
  }
  if (!row.email?.trim()) {
    errors.push({ row: rowIndex, field: 'email', message: 'Delegate email is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.push({ row: rowIndex, field: 'email', message: 'Invalid delegate email format' });
  }

  // Parent fields are optional, but if parentEmail is provided, firstName and lastName are required
  const hasParentEmail = row.parentEmail?.trim();
  if (hasParentEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.parentEmail.trim())) {
      errors.push({ row: rowIndex, field: 'parentEmail', message: 'Invalid parent email format' });
    }
    if (!row.parentFirstName?.trim()) {
      errors.push({ row: rowIndex, field: 'parentFirstName', message: 'Parent first name is required when parent email is provided' });
    }
    if (!row.parentLastName?.trim()) {
      errors.push({ row: rowIndex, field: 'parentLastName', message: 'Parent last name is required when parent email is provided' });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateStaffRow(
  row: Record<string, string>,
  rowIndex: number,
  groupingMap: Map<string, number>,
): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // Required fields
  if (!row.firstName?.trim()) {
    errors.push({ row: rowIndex, field: 'firstName', message: 'First name is required' });
  }
  if (!row.lastName?.trim()) {
    errors.push({ row: rowIndex, field: 'lastName', message: 'Last name is required' });
  }
  if (!row.email?.trim()) {
    errors.push({ row: rowIndex, field: 'email', message: 'Email is required' });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
    errors.push({ row: rowIndex, field: 'email', message: 'Invalid email format' });
  }
  if (!row.role?.trim()) {
    errors.push({ row: rowIndex, field: 'role', message: 'Role is required' });
  } else if (!VALID_STAFF_ROLES.includes(row.role.toLowerCase().trim())) {
    errors.push({ row: rowIndex, field: 'role', message: `Invalid role "${row.role}". Valid: ${VALID_STAFF_ROLES.join(', ')}` });
  }

  // Optional fields
  if (row.groupingName?.trim() && !groupingMap.has(row.groupingName.toLowerCase().trim())) {
    warnings.push({ row: rowIndex, field: 'groupingName', message: `Grouping "${row.groupingName}" not found, will be skipped` });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Preview bulk import (dry run)
router.post('/program-years/:id/bulk/preview/:type', async (req, res) => {
  const { id, type } = req.params as { id: string; type: string };
  const caller = (req as any).user as { userId: number };
  const { csvContent } = req.body as { csvContent: string };

  if (!csvContent) {
    res.status(400).json({ error: 'csvContent is required' });
    return;
  }

  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Program year not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (type !== 'delegates' && type !== 'staff') {
    res.status(400).json({ error: 'Type must be "delegates" or "staff"' });
    return;
  }

  // Parse CSV
  const { headers, rows } = parseCSV(csvContent);

  if (rows.length === 0) {
    res.status(400).json({ error: 'No data rows found in CSV' });
    return;
  }

  // Get year-activated groupings and parties for lookup (not base tables)
  const activatedGroupings = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { grouping: true },
  });
  const groupingMap = new Map(activatedGroupings.map((ag) => [ag.grouping.name.toLowerCase(), ag.grouping.id]));

  const activatedParties = await prisma.programYearParty.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { party: true },
  });
  const partyMap = new Map(activatedParties.map((ap) => [ap.party.name.toLowerCase(), ap.party.id]));
  const partyToYearPartyMap = new Map(activatedParties.map((ap) => [ap.party.name.toLowerCase(), ap.id]));

  // Check for existing emails (both delegate and parent emails)
  const delegateEmails = rows.map((r) => r.email?.trim().toLowerCase()).filter(Boolean);
  const parentEmails = rows.map((r) => r.parentEmail?.trim().toLowerCase()).filter(Boolean);
  const allEmails = [...new Set([...delegateEmails, ...parentEmails])];

  const existingUsers = await prisma.user.findMany({
    where: { email: { in: allEmails } },
    select: { email: true },
  });
  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));

  // Validate rows
  const allErrors: ValidationResult['errors'] = [];
  const allWarnings: ValidationResult['warnings'] = [];
  const preview: {
    row: number;
    data: Record<string, string>;
    status: 'new' | 'existing';
    valid: boolean;
  }[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // +2 for 1-based index and header row
    let validation: ValidationResult;

    if (type === 'delegates') {
      validation = validateDelegateRow(row, rowNum);
    } else {
      validation = validateStaffRow(row, rowNum, groupingMap);
    }

    allErrors.push(...validation.errors);
    allWarnings.push(...validation.warnings);

    const email = row.email?.trim().toLowerCase();
    preview.push({
      row: rowNum,
      data: row,
      status: existingEmailSet.has(email) ? 'existing' : 'new',
      valid: validation.valid,
    });
  });

  // Count parents that will be created (for delegates only)
  let newParents = 0;
  if (type === 'delegates') {
    preview.forEach((p) => {
      if (p.valid && p.data.parentEmail?.trim()) {
        const parentEmail = p.data.parentEmail.trim().toLowerCase();
        if (!existingEmailSet.has(parentEmail)) {
          newParents++;
        }
      }
    });
  }

  res.json({
    headers,
    totalRows: rows.length,
    validRows: preview.filter((p) => p.valid).length,
    newUsers: preview.filter((p) => p.status === 'new' && p.valid).length,
    existingUsers: preview.filter((p) => p.status === 'existing' && p.valid).length,
    newParents,
    errors: allErrors,
    warnings: allWarnings,
    preview: preview.slice(0, 100), // Limit preview to first 100 rows
  });
});

// Execute bulk import
router.post('/program-years/:id/bulk/import/:type', async (req, res) => {
  const { id, type } = req.params as { id: string; type: string };
  const caller = (req as any).user as { userId: number };
  const { csvContent, sendEmails } = req.body as { csvContent: string; sendEmails: boolean };

  if (!csvContent) {
    res.status(400).json({ error: 'csvContent is required' });
    return;
  }

  const py = await prisma.programYear.findUnique({
    where: { id: Number(id) },
    include: { program: true },
  });
  if (!py) {
    res.status(404).json({ error: 'Program year not found' });
    return;
  }

  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  if (type !== 'delegates' && type !== 'staff') {
    res.status(400).json({ error: 'Type must be "delegates" or "staff"' });
    return;
  }

  // Parse CSV
  const { rows } = parseCSV(csvContent);

  if (rows.length === 0) {
    res.status(400).json({ error: 'No data rows found in CSV' });
    return;
  }

  // Get year-activated groupings and parties for lookup (not base tables)
  const activatedGroupings = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { grouping: true },
  });
  const groupingMap = new Map(activatedGroupings.map((ag) => [ag.grouping.name.toLowerCase(), ag.grouping.id]));

  const activatedParties = await prisma.programYearParty.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { party: true },
  });
  const partyMap = new Map(activatedParties.map((ap) => [ap.party.name.toLowerCase(), ap.party.id]));
  const partyToYearPartyMap = new Map(activatedParties.map((ap) => [ap.party.name.toLowerCase(), ap.id]));

  const results = {
    success: 0,
    failed: 0,
    skipped: 0,
    usersCreated: 0,
    parentsCreated: 0,
    emailsSent: 0,
    emailsFailed: 0,
    errors: [] as { row: number; email: string; error: string }[],
  };

  // Process rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const email = row.email?.trim().toLowerCase();

    // Validate
    let validation: ValidationResult;
    if (type === 'delegates') {
      validation = validateDelegateRow(row, rowNum);
    } else {
      validation = validateStaffRow(row, rowNum, groupingMap);
    }

    if (!validation.valid) {
      results.failed++;
      results.errors.push({
        row: rowNum,
        email: email || 'N/A',
        error: validation.errors.map((e) => e.message).join('; '),
      });
      continue;
    }

    try {
      // Check if user exists
      let user = await prisma.user.findUnique({ where: { email } });
      let tempPassword: string | undefined;

      if (!user) {
        // Create new user
        tempPassword = generateTempPassword();
        const hashedPassword = await hashPassword(tempPassword);
        user = await prisma.user.create({
          data: { email, password: hashedPassword },
        });
        results.usersCreated++;
        logger.info(py.programId, `Bulk import: Created user ${email}`);
      }

      if (type === 'delegates') {
        // Check for existing delegate
        const existingDelegate = await prisma.delegate.findFirst({
          where: { programYearId: py.id, email },
        });

        if (existingDelegate) {
          results.skipped++;
          continue;
        }

        // Create delegate (grouping/party assigned later via random assignment or manual edit)
        const delegate = await prisma.delegate.create({
          data: {
            programYearId: py.id,
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            email,
            phone: row.phone?.trim() || null,
            userId: user.id,
            groupingId: null,
            partyId: null,
            status: 'pending_assignment',
          },
        });

        // Add program assignment for the user
        const existingAssignment = await prisma.programAssignment.findFirst({
          where: { userId: user.id, programId: py.programId },
        });
        if (!existingAssignment) {
          await prisma.programAssignment.create({
            data: { userId: user.id, programId: py.programId, role: 'delegate' },
          });
        }

        logger.info(py.programId, `Bulk import: Created delegate ${row.firstName} ${row.lastName}`);

        // Create parent if parent info provided
        const parentEmail = row.parentEmail?.trim().toLowerCase();
        if (parentEmail && row.parentFirstName?.trim() && row.parentLastName?.trim()) {
          // Check if parent user exists
          let parentUser = await prisma.user.findUnique({ where: { email: parentEmail } });
          let parentTempPassword: string | undefined;

          if (!parentUser) {
            parentTempPassword = generateTempPassword();
            const hashedParentPassword = await hashPassword(parentTempPassword);
            parentUser = await prisma.user.create({
              data: { email: parentEmail, password: hashedParentPassword },
            });
            results.usersCreated++;
            logger.info(py.programId, `Bulk import: Created parent user ${parentEmail}`);
          }

          // Check if parent record already exists for this program year
          let parent = await prisma.parent.findFirst({
            where: { programYearId: py.id, email: parentEmail },
          });

          if (!parent) {
            parent = await prisma.parent.create({
              data: {
                programYearId: py.id,
                firstName: row.parentFirstName.trim(),
                lastName: row.parentLastName.trim(),
                email: parentEmail,
                phone: row.parentPhone?.trim() || null,
                userId: parentUser.id,
                status: 'active',
              },
            });
            results.parentsCreated++;
            logger.info(py.programId, `Bulk import: Created parent ${row.parentFirstName} ${row.parentLastName}`);
          }

          // Create delegate-parent link
          const existingLink = await prisma.delegateParentLink.findFirst({
            where: { delegateId: delegate.id, parentId: parent.id },
          });

          if (!existingLink) {
            await prisma.delegateParentLink.create({
              data: {
                delegateId: delegate.id,
                parentId: parent.id,
                programYearId: py.id,
                status: 'active',
              },
            });
            logger.info(py.programId, `Bulk import: Linked delegate ${delegate.id} to parent ${parent.id}`);
          }

          // Add parent program assignment
          const parentAssignment = await prisma.programAssignment.findFirst({
            where: { userId: parentUser.id, programId: py.programId },
          });
          if (!parentAssignment) {
            await prisma.programAssignment.create({
              data: { userId: parentUser.id, programId: py.programId, role: 'parent' },
            });
          }
        }

        // Send welcome email if requested
        if (sendEmails && tempPassword) {
          try {
            const sent = await sendAcceptanceEmail(
              py.programId,
              email,
              row.firstName.trim(),
              row.lastName.trim(),
              py.program.name,
              py.year,
              'delegate',
              undefined,
              tempPassword,
            );
            if (sent) {
              results.emailsSent++;
            } else {
              results.emailsFailed++;
            }
          } catch (emailErr) {
            results.emailsFailed++;
            logger.error(py.programId, `Failed to send welcome email to ${email}`, emailErr);
          }
        }
      } else {
        // Staff
        const existingStaff = await prisma.staff.findFirst({
          where: { programYearId: py.id, email },
        });

        if (existingStaff) {
          results.skipped++;
          continue;
        }

        // Resolve grouping
        const groupingId = row.groupingName?.trim()
          ? groupingMap.get(row.groupingName.toLowerCase().trim()) || null
          : null;

        // Create staff
        await prisma.staff.create({
          data: {
            programYearId: py.id,
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            email,
            phone: row.phone?.trim() || null,
            userId: user.id,
            role: row.role.toLowerCase().trim(),
            groupingId,
            status: 'active',
          },
        });

        // Add program assignment for the user
        const existingAssignment = await prisma.programAssignment.findFirst({
          where: { userId: user.id, programId: py.programId },
        });
        if (!existingAssignment) {
          const assignmentRole = row.role.toLowerCase().trim() === 'administrator' ? 'admin' : 'staff';
          await prisma.programAssignment.create({
            data: { userId: user.id, programId: py.programId, role: assignmentRole },
          });
        }

        logger.info(py.programId, `Bulk import: Created staff ${row.firstName} ${row.lastName} (${row.role})`);

        // Send welcome email if requested
        if (sendEmails && tempPassword) {
          try {
            const sent = await sendAcceptanceEmail(
              py.programId,
              email,
              row.firstName.trim(),
              row.lastName.trim(),
              py.program.name,
              py.year,
              'staff',
              row.role.trim(),
              tempPassword,
            );
            if (sent) {
              results.emailsSent++;
            } else {
              results.emailsFailed++;
            }
          } catch (emailErr) {
            results.emailsFailed++;
            logger.error(py.programId, `Failed to send welcome email to ${email}`, emailErr);
          }
        }
      }

      results.success++;
    } catch (err: any) {
      results.failed++;
      results.errors.push({
        row: rowNum,
        email: email || 'N/A',
        error: err.message || 'Unknown error',
      });
      logger.error(py.programId, `Bulk import error for row ${rowNum}`, err);
    }
  }

  logger.info(py.programId, `Bulk import completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

  res.json(results);
});

export default router;
