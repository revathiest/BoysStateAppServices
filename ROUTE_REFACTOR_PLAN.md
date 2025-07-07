# Route Refactor Progress

This file tracks ongoing work to split the legacy `api.ts` router into
smaller domain modules under `src/routes`.

## Completed
- Created `auth.ts` and `system.ts` in earlier refactors.
- New modules added:
  - `programs.ts` for `/programs` and related endpoints.
  - `programYears.ts` for `/program-years` and `/programs/:programId/years`.
  - `app.ts` updated to mount these routers.
  - `groupingTypes.ts` for grouping type CRUD.
  - `groupings.ts` for grouping management.

## Remaining work
- Extract remaining domains from `api.ts` into separate modules:
  - `parties.ts`
  - `positions.ts`
  - `programYearPositions.ts`
  - `delegates.ts`
  - `staff.ts`
  - `parents.ts`
  - `elections.ts`
  - `links.ts` (optional)
  - `users.ts` for `/user-programs/:username` export has been moved, but verify.
- Update `openapi.yaml` paths if needed once splitting is complete.

This document should be updated as each module is migrated.
