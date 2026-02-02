import express from 'express';
import cors, { CorsOptions } from 'cors';
import { execSync } from 'child_process';
import { verify } from './jwt';
import { config } from './config';
import * as logger from './logger';
import authRoutes, { loginAttempts } from './routes/auth';
import systemRoutes, { swaggerDoc } from './routes/system';
import programsRoutes from './routes/programs';
import programYearRoutes from './routes/programYears';
import groupingTypeRoutes from './routes/groupingTypes';
import groupingRoutes from './routes/groupings';
import partiesRoutes from './routes/parties';
import positionsRoutes from './routes/positions';
import programYearPositionRoutes from './routes/programYearPositions';
import delegatesRoutes from './routes/delegates';
import staffRoutes from './routes/staff';
import parentsRoutes from './routes/parents';
import electionsRoutes from './routes/elections';
import brandingContactRoutes from './routes/brandingContact';
import applicationsRoutes from './routes/applications';
import applicationReviewRoutes from './routes/applicationReviews';
import emailConfigRoutes from './routes/emailConfig';
import emailTemplateRoutes from './routes/emailTemplates';
import bulkOperationsRoutes from './routes/bulkOperations';
import permissionsRoutes from './routes/permissions';

const app = express();
const corsOptions: CorsOptions = { origin: true, credentials: true };
app.use(cors(corsOptions));
app.use(express.json());

app.use((req, _res, next) => {
  const programId = (req as any).user?.programId || 'system';
  logger.info(programId, `${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  if (
    req.path === '/login' ||
    req.path === '/register' ||
    req.path.startsWith('/docs') ||
    (req.method === 'GET' && /^\/api\/programs\/[^/]+\/application$/.test(req.path)) ||
    (req.method === 'POST' && /^\/api\/programs\/[^/]+\/application\/responses$/.test(req.path))
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
    (req as any).user = verify(token, config.jwtSecret);
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
app.use(partiesRoutes);
app.use(positionsRoutes);
app.use(programYearPositionRoutes);
app.use(delegatesRoutes);
app.use(staffRoutes);
app.use(parentsRoutes);
app.use(electionsRoutes);
app.use(brandingContactRoutes);
app.use(applicationsRoutes);
app.use(applicationReviewRoutes);
app.use(emailConfigRoutes);
app.use(emailTemplateRoutes);
app.use(bulkOperationsRoutes);
app.use(permissionsRoutes);

const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
  ensureDatabase();
  app.listen(port, () => {
    logger.info('system', `Server listening on port ${port}`);
  });
}

export { app as default, loginAttempts, swaggerDoc };
