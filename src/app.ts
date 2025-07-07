import express from 'express';
import cors, { CorsOptions } from 'cors';
import { execSync } from 'child_process';
import { verify } from './jwt';
import * as logger from './logger';
import authRoutes, { loginAttempts } from './routes/auth';
import systemRoutes, { swaggerDoc } from './routes/system';
import programsRoutes from './routes/programs';
import programYearRoutes from './routes/programYears';
import groupingTypeRoutes from './routes/groupingTypes';
import groupingRoutes from './routes/groupings';
import apiRoutes from './routes/api';

const app = express();
const corsOptions: CorsOptions = { origin: true, credentials: true };
app.use(cors(corsOptions));
app.use(express.json());

app.use((req, _res, next) => {
  const programId = (req as any).user?.programId || 'system';
  logger.info(programId, `${req.method} ${req.path}`);
  next();
});

const jwtSecret = process.env.JWT_SECRET || 'development-secret';

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

export function ensureDatabase() {
  try {
    logger.info('system', 'Running database synchronization');
    execSync('npx prisma db push', { stdio: 'inherit' });
  } catch (err) {
    logger.error('system', 'Database synchronization failed', err);
  }
}

app.use(authRoutes);
app.use(systemRoutes);
app.use(programsRoutes);
app.use(programYearRoutes);
app.use(groupingTypeRoutes);
app.use(groupingRoutes);
app.use(apiRoutes);

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  ensureDatabase();
  app.listen(port, () => {
    logger.info('system', `Server listening on port ${port}`);
  });
}

export { app as default, loginAttempts, swaggerDoc };
