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
  - `parties.ts` for party management.
  - `positions.ts` for position management.
  - `programYearPositions.ts` for assigning positions to a program year.
  - `delegates.ts` for delegate CRUD.
  - `staff.ts` for staff management.
  - `parents.ts` including delegate-parent links.
  - `elections.ts` for election operations.

## Remaining work
- Extract remaining domains from `api.ts` into separate modules:
  - `links.ts` (optional)
  - Verify `users.ts` for `/user-programs/:username` export.
- Update `openapi.yaml` paths if needed once splitting is complete.

This document should be updated as each module is migrated.
