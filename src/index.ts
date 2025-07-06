import express from 'express';
import cors, { CorsOptions } from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import prisma from './prisma';
import { sign, verify } from './jwt';
import * as logger from './logger';

const scrypt = promisify(_scrypt);

const app = express();
// Configure CORS to allow credentialed requests
const corsOptions: CorsOptions = {
  origin: true,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

app.use((req, _res, next) => {
  const programId = (req as any).user?.programId || 'system';
  logger.info(programId, `${req.method} ${req.path}`);
  next();
});

const jwtSecret = process.env.JWT_SECRET || 'development-secret';

const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

app.use((req, res, next) => {
  if (
    req.path === '/login' ||
    req.path === '/register' ||
    req.path.startsWith('/docs')
  ) {
    return next();
  }
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const token = auth.slice(7);
  try {
    (req as any).user = verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

function ensureDatabase() {
  try {
    logger.info('system', 'Running database synchronization');
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (err) {
    logger.error('system', 'Database synchronization failed', err);
  }
}

// Load OpenAPI spec
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));

app.get('/docs/swagger.json', (_req, res) => {
  res.json(openApiDoc);
});

// Override server URL when not in production so Swagger points to the local API
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'production') {
  openApiDoc.servers = [{ url: `http://localhost:${port}` }];
}

app.get('/docs/swagger-ui-custom.js', (_req, res) => {
  res.sendFile(path.join(__dirname, 'swagger-ui-custom.js'));
});

const docsOptions = {
  customJs: 'swagger-ui-custom.js',
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc, docsOptions));

export const swaggerDoc = openApiDoc;

app.post('/register', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(400).json({ error: 'User already exists' });
    return;
  }

  const salt = randomBytes(16).toString('hex');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  const hashed = `${salt}:${buf.toString('hex')}`;

  await prisma.user.create({ data: { email, password: hashed } });
  logger.info('system', `User registered: ${email}`);
  res.status(201).json({ message: 'User created' });
  return;
});

app.post('/login', async (req: express.Request, res: express.Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const now = Date.now();
  const ip = req.ip || '';
  const attempt = loginAttempts.get(ip);
  if (attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS && attempt.count >= MAX_LOGIN_ATTEMPTS) {
    logger.warn('system', `Too many login attempts from ${ip}`);
    res.status(429).json({ error: 'Too many login attempts' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
    loginAttempts.set(ip, { count, lastAttempt: now });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const [salt, storedHash] = user.password.split(':');
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  if (buf.toString('hex') !== storedHash) {
    const count = attempt && now - attempt.lastAttempt < LOGIN_WINDOW_MS ? attempt.count + 1 : 1;
    loginAttempts.set(ip, { count, lastAttempt: now });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  loginAttempts.delete(ip);

  const token = sign({ userId: user.id, email: user.email }, jwtSecret);
  logger.info('system', `User logged in: ${email}`);
  res.json({ token });
  return;
});

app.get('/health', async (_req, res) => {
  logger.info('system', 'Serving /health');
  let dbStatus = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error('system', 'Database check failed', err);
    dbStatus = 'error';
  }
  res.json({ status: 'ok', database: dbStatus });
});

app.post('/logs', (req: express.Request, res: express.Response) => {
  const { programId, level, message, error, source } = req.body as {
    programId?: string;
    level?: string;
    message?: string;
    error?: string;
    source?: string;
  };
  if (!programId || !level || !message) {
    res.status(400).json({ error: 'programId, level, and message required' });
    return;
  }
  const lvl = level as string;
  if (!['debug', 'info', 'warn', 'error'].includes(lvl)) {
    res.status(400).json({ error: 'Invalid level' });
    return;
  }
  const src = source || 'client';
  switch (lvl) {
    case 'debug':
      logger.debug(programId, message, src);
      break;
    case 'info':
      logger.info(programId, message, src);
      break;
    case 'warn':
      logger.warn(programId, message, src);
      break;
    case 'error':
      logger.error(programId, message, error, src);
      break;
  }
  res.status(204).send();
});

app.get('/logs', async (req: express.Request, res: express.Response) => {
  const {
    programId,
    level,
    source,
    dateFrom,
    dateTo,
    search,
    page = '1',
    pageSize = '50',
  } = req.query as {
    programId?: string;
    level?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  };

  if (level && !['debug', 'info', 'warn', 'error'].includes(level)) {
    res.status(400).json({ error: 'Invalid level' });
    return;
  }

  let p = parseInt(page, 10);
  if (isNaN(p) || p < 1) p = 1;
  let size = parseInt(pageSize, 10);
  if (isNaN(size) || size < 1) size = 50;
  if (size > 100) size = 100;

  const where: any = {};
  if (programId) where.programId = programId;
  if (level) where.level = level;
  if (source) where.source = source;
  if (dateFrom || dateTo) {
    where.timestamp = {} as any;
    if (dateFrom) (where.timestamp as any).gte = new Date(dateFrom);
    if (dateTo) (where.timestamp as any).lte = new Date(dateTo);
  }

  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    where.OR = [{ message: contains }, { error: contains }, { source: contains }];
  }

  const total = await prisma.log.count({ where });
  const logs = await prisma.log.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    skip: (p - 1) * size,
    take: size,
  });

  res.json({ logs, page: p, pageSize: size, total });
});

export async function getUserPrograms(
  req: express.Request,
  res: express.Response
) {
  const { username } = req.params as { username?: string };
  if (!username) {
    res.status(400).json({ error: 'Username required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: username } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const assignments = await prisma.programAssignment.findMany({
    where: { userId: user.id },
    include: { program: true },
  });
  const programs = assignments.map((a: any) => ({
    programId: a.program.id,
    programName: a.program.name,
    role: a.role,
  }));
  programs.forEach((p: any) => {
    logger.info(p.programId, `Program lookup for ${user.email}`);
  });
  res.json({ username: user.email, programs });
}


async function isProgramAdmin(userId: number, programId: string) {
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId, programId },
  });
  return assignment?.role === 'admin';
}

async function isProgramMember(userId: number, programId: string) {
  const assignment = await prisma.programAssignment.findFirst({
    where: { userId, programId },
  });
  return Boolean(assignment);
}

app.post('/programs', async (req: express.Request, res: express.Response) => {
  const user = (req as any).user as { userId: number; email: string };
  const { name, year, config } = req.body as {
    name?: string;
    year?: number;
    config?: any;
  };
  if (!name || !year) {
    res.status(400).json({ error: 'name and year required' });
    return;
  }
  const program = await prisma.program.create({
    data: {
      name,
      year,
      config,
      createdBy: { connect: { id: user.userId } },
    },
  });
  await prisma.programAssignment.create({
    data: { userId: user.userId, programId: program.id, role: 'admin' },
  });
  logger.info(program.id, `Program created by ${user.email}`);
  res.status(201).json({
    id: program.id,
    name: program.name,
    year: program.year,
    createdBy: user.userId,
    roleAssigned: 'admin',
  });
});

app.get('/programs', async (_req: express.Request, res: express.Response) => {
  const programs = await prisma.program.findMany();
  res.json(programs);
});


app.post(
  '/programs/:programId/users',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number; email: string };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { userId, role } = req.body as { userId?: number; role?: string };
    if (!userId || !role) {
      res.status(400).json({ error: 'userId and role required' });
      return;
    }
    await prisma.programAssignment.create({
      data: { userId, programId, role },
    });
    logger.info(programId, `User ${userId} assigned role ${role}`);
    res.status(201).json({
      programId,
      userId,
      role,
      status: 'assigned',
    });
  },
);

app.get(
  '/programs/:programId/users',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number; email: string };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const assignments = await prisma.programAssignment.findMany({
      where: { programId },
      select: { userId: true, role: true },
    });
    logger.info(programId, `Listed users for program`);
    res.json(assignments);
  },
);

app.post(
  '/programs/:programId/years',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number; email: string };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { year, startDate, endDate, status, notes } = req.body as {
      year?: number;
      startDate?: string;
      endDate?: string;
      status?: string;
      notes?: string;
    };
    if (!year) {
      res.status(400).json({ error: 'year required' });
      return;
    }
    const py = await prisma.programYear.create({
      data: {
        programId,
        year,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        status: status || 'active',
        notes,
      },
    });
    logger.info(programId, `Program year ${year} created`);
    res.status(201).json(py);
  },
);

app.get(
  '/programs/:programId/years',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const years = await prisma.programYear.findMany({
      where: { programId },
      orderBy: { year: 'desc' },
    });
    res.json(years);
  },
);

app.get('/program-years/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(py);
});

app.put('/program-years/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { startDate, endDate, status, notes } = req.body as {
    startDate?: string;
    endDate?: string;
    status?: string;
    notes?: string;
  };
  const updated = await prisma.programYear.update({
    where: { id: Number(id) },
    data: {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status,
      notes,
    },
  });
  logger.info(py.programId, `Program year ${py.year} updated`);
  res.json(updated);
});

app.delete('/program-years/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.programYear.update({
    where: { id: Number(id) },
    data: { status: 'archived' },
  });
  logger.info(py.programId, `Program year ${py.year} archived`);
  res.json(updated);
});

app.get('/user-programs/:username', getUserPrograms);

app.get('/programs/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const member = await isProgramMember(caller.userId, id!);
  if (!member) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(program);
});

app.put('/programs/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, id!);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, year, config, status } = req.body as {
    name?: string;
    year?: number;
    config?: any;
    status?: string;
  };
  const updated = await prisma.program.update({
    where: { id },
    data: { name, year, config, status },
  });
  logger.info(id!, `Program updated by ${caller.email}`);
  res.json(updated);
});

app.delete('/programs/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number; email: string };
  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, id!);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.program.update({
    where: { id },
    data: { status: 'retired' },
  });
  logger.info(id!, `Program retired by ${caller.email}`);
  res.json(updated);
});

app.post(
  '/programs/:programId/grouping-types',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number; email: string };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isAdmin = await isProgramAdmin(caller.userId, programId);
    if (!isAdmin) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const {
      defaultName,
      customName,
      pluralName,
      levelOrder,
      isRequired,
    } = req.body as {
      defaultName?: string;
      customName?: string;
      pluralName?: string;
      levelOrder?: number;
      isRequired?: boolean;
    };
    if (!defaultName || levelOrder === undefined) {
      res.status(400).json({ error: 'defaultName and levelOrder required' });
      return;
    }
    const gt = await prisma.groupingType.create({
      data: {
        programId,
        defaultName,
        customName,
        pluralName,
        levelOrder,
        isRequired: Boolean(isRequired),
        status: 'active',
      },
    });
    logger.info(programId, `GroupingType ${gt.id} created`);
    res.status(201).json(gt);
  },
);

app.get(
  '/programs/:programId/grouping-types',
  async (req: express.Request, res: express.Response) => {
    const { programId } = req.params as { programId?: string };
    const caller = (req as any).user as { userId: number };
    if (!programId) {
      res.status(400).json({ error: 'programId required' });
      return;
    }
    const isMember = await isProgramMember(caller.userId, programId);
    if (!isMember) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const types = await prisma.groupingType.findMany({
      where: { programId },
      orderBy: { levelOrder: 'asc' },
    });
    res.json(types);
  },
);

app.put('/grouping-types/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const gt = await prisma.groupingType.findUnique({ where: { id: Number(id) } });
  if (!gt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { customName, pluralName, levelOrder, isRequired, status } = req.body as {
    customName?: string;
    pluralName?: string;
    levelOrder?: number;
    isRequired?: boolean;
    status?: string;
  };
  const updated = await prisma.groupingType.update({
    where: { id: Number(id) },
    data: {
      customName,
      pluralName,
      levelOrder,
      isRequired,
      status,
    },
  });
  logger.info(gt.programId, `GroupingType ${gt.id} updated`);
  res.json(updated);
});

app.delete('/grouping-types/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const gt = await prisma.groupingType.findUnique({ where: { id: Number(id) } });
  if (!gt) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, gt.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.groupingType.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(gt.programId, `GroupingType ${gt.id} retired`);
  res.json(updated);
});

app.post('/programs/:programId/groupings', async (req: express.Request, res: express.Response) => {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number; email: string };
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { groupingTypeId, parentGroupingId, name, displayOrder, notes } = req.body as {
    groupingTypeId?: number;
    parentGroupingId?: number;
    name?: string;
    displayOrder?: number;
    notes?: string;
  };
  if (!groupingTypeId || !name) {
    res.status(400).json({ error: 'groupingTypeId and name required' });
    return;
  }
  const grouping = await prisma.grouping.create({
    data: {
      programId,
      groupingTypeId,
      parentGroupingId,
      name,
      displayOrder,
      notes,
      status: 'active',
    },
  });
  logger.info(programId, `Grouping ${grouping.id} created`);
  res.status(201).json(grouping);
});

app.get('/programs/:programId/groupings', async (req: express.Request, res: express.Response) => {
  const { programId } = req.params as { programId?: string };
  const caller = (req as any).user as { userId: number };
  if (!programId) {
    res.status(400).json({ error: 'programId required' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const groupings = await prisma.grouping.findMany({
    where: { programId },
    orderBy: { displayOrder: 'asc' },
  });
  res.json(groupings);
});

app.put('/groupings/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const grouping = await prisma.grouping.findUnique({ where: { id: Number(id) } });
  if (!grouping) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { name, displayOrder, notes, parentGroupingId, status } = req.body as {
    name?: string;
    displayOrder?: number;
    notes?: string;
    parentGroupingId?: number;
    status?: string;
  };
  const updated = await prisma.grouping.update({
    where: { id: Number(id) },
    data: { name, displayOrder, notes, parentGroupingId, status },
  });
  logger.info(grouping.programId, `Grouping ${grouping.id} updated`);
  res.json(updated);
});

app.delete('/groupings/:id', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const grouping = await prisma.grouping.findUnique({ where: { id: Number(id) } });
  if (!grouping) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, grouping.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const updated = await prisma.grouping.update({
    where: { id: Number(id) },
    data: { status: 'retired' },
  });
  logger.info(grouping.programId, `Grouping ${grouping.id} retired`);
  res.json(updated);
});

app.post('/program-years/:id/groupings/activate', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isAdmin = await isProgramAdmin(caller.userId, py.programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const { groupingIds } = req.body as { groupingIds?: number[] };
  if (!Array.isArray(groupingIds) || groupingIds.length === 0) {
    res.status(400).json({ error: 'groupingIds required' });
    return;
  }
  const records = await Promise.all(
    groupingIds.map((gid) =>
      prisma.programYearGrouping.create({
        data: { programYearId: py.id, groupingId: gid, status: 'active' },
      })
    )
  );
  logger.info(py.programId, `Activated ${records.length} groupings for PY ${py.year}`);
  res.status(201).json(records);
});

app.get('/program-years/:id/groupings', async (req: express.Request, res: express.Response) => {
  const { id } = req.params as { id?: string };
  const caller = (req as any).user as { userId: number };
  const py = await prisma.programYear.findUnique({ where: { id: Number(id) } });
  if (!py) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const isMember = await isProgramMember(caller.userId, py.programId);
  if (!isMember) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const records = await prisma.programYearGrouping.findMany({
    where: { programYearId: py.id, status: 'active' },
    include: { grouping: true },
  });
  res.json(records);
});

if (process.env.NODE_ENV !== 'test') {
  ensureDatabase();
  app.listen(port, () => {
    logger.info('system', `Server listening on port ${port}`);
  });
}

export { loginAttempts, ensureDatabase };
export default app;
