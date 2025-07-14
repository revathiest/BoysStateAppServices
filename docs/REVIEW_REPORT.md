# Code Review Report

This report summarizes discrepancies and pending work comparing the codebase with documentation and requirements.

## Disclaimers
- Disclaimers referencing the American Legion appear in multiple files including `README.md`, `AGENTS.md`, `NOTICE.md`, `package.json`, and the OpenAPI spec.

## Development Standards
- `README.md` instructs contributors to run tests and `npm run build` before opening a PR.
- `AGENTS.md` reiterates automated testing and building before PRs, and enforces use of `src/logger.ts` for all logs.

## Logging
- All source files use `logger.ts` for logging and no `console.log` statements are present.
- Tests generate log files in `logs/` with filenames per `programId`.

## Endpoint Coverage
- `docs/ENDPOINTS.md` lists all REST endpoints as completed. Corresponding route files exist under `src/routes/` and have associated tests.
- Swagger/OpenAPI documentation in `src/openapi.yaml` includes the required disclaimer text.

## Security and Isolation
- Most routes check permissions using helpers from `src/utils/auth.ts`.
- The `/programs` `GET` endpoint returns all programs without restriction, which may conflict with the "Per-program data isolation" statement in `AGENTS.md`.

## Planned Agents
- The agents for WebSocket events, progress tracking, and integrations (Google Calendar/Docs, Discord) are noted as planned in `AGENTS.md` but are not yet implemented.

## Build Artifacts
- `npm test` and `npm run build` complete successfully with coverage over the thresholds defined in `jest.config.js`.

Pending work primarily relates to the planned agents and clarifying data isolation on the `/programs` endpoint.
