# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Start dev server (runs prisma generate + ts-node)
npm run build            # Compile TypeScript to dist/

# Testing
npm test                 # Run all tests with coverage
npm test -- --testPathPattern="programs"  # Run specific test file
npm test -- -t "returns programs"         # Run tests matching name

# Database
npm run prisma:generate  # Generate Prisma client after schema changes
npm run prisma:migrate   # Run migrations
npm run prisma:reset     # Reset database and regenerate client
```

## Architecture

**Stack:** Node.js + Express 5 + TypeScript + Prisma ORM + PostgreSQL

### Core Structure

- `src/app.ts` - Express app setup, middleware, route mounting
- `src/routes/` - REST API endpoints organized by domain (programs, delegates, applications, etc.)
- `src/utils/auth.ts` - Authorization helpers (`isProgramAdmin`, `isProgramMember`)
- `src/logger.ts` - Program-scoped logging (writes to `logs/<programId>.log` and database)
- `src/prisma.ts` - Prisma client singleton
- `prisma/schema.prisma` - Database schema

### Key Patterns

**Multi-tenancy:** All data is scoped by `programId`. Routes extract program context and enforce isolation.

**Authentication:** JWT-based. Middleware in `app.ts` verifies tokens except for public endpoints (`/login`, `/register`, `/docs`, public application endpoints).

**Authorization:** Routes check `isProgramAdmin()` or `isProgramMember()` from `src/utils/auth.ts` before operations.

**Logging:** Use `import * as logger from '../logger'` instead of `console.log`. All log functions require `programId` as first argument:
```typescript
logger.info(programId, `Created position "${name}" by ${caller.email}`);
logger.error(programId, 'Operation failed', err);
```

**Route handler pattern:**
```typescript
router.post('/programs/:programId/resource', async (req, res) => {
  const { programId } = req.params;
  const caller = (req as any).user as { userId: number; email: string };

  const isAdmin = await isProgramAdmin(caller.userId, programId);
  if (!isAdmin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  // ... business logic
});
```

### Testing

Tests use Jest + Supertest with mocked Prisma client:
```typescript
jest.mock('../src/prisma');
import prisma from '../src/prisma';
const mockedPrisma = prisma as any;

// In tests:
mockedPrisma.model.method.mockResolvedValueOnce(data);
```

Coverage thresholds: 75% branches, 80% functions/lines/statements.

## Important Conventions

- API documentation at `/docs` (Swagger/OpenAPI from `src/openapi.yaml`)
- Run `npm run build` before PRs to update `dist/` folder
- DEVELOPMENT program grants access to all programs (for dev/testing)
