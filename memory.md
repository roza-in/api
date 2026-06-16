# Memory — Database Migration Audit, Constraints & Test Fixes

Last updated: 2026-06-16T00:49:00+05:30

## What was built
- **Database Migrations Baseline**: Replaced orphan manual SQL files with a structured Prisma baseline migration (`init`).
- **Database Constraints Migration**: Created and successfully deployed a second migration (`add_constraints`) introducing:
  - The `btree_gist` PostgreSQL extension.
  - An exclusion constraint (`appointments_no_time_overlap`) on the appointments table to prevent double-bookings.
  - Seven raw SQL CHECK constraints enforcing time ordering, positive transaction amounts, rating bounds, and price validation.
- **Unit Test Fixes**:
  - Corrected all lowercase string mock definitions and assertions to align with uppercase Prisma enums inside `analytics.service.spec.ts`, `notification.processor.spec.ts`, and `notifications.service.spec.ts`.
  - Resolved type mismatch errors in `compliance.controller.spec.ts` and `compliance.service.spec.ts` by mapping string literals to the appropriate `ConsentType` and `ConsentSource` enums.
  - Fixed a possible undefined warning in `domains.service.spec.ts` using non-null assertions.
- **Prisma 7 Configuration**: Declared the migration seeding command inside [prisma.config.ts](file:///c:/Users/shiva/OneDrive/Documents/Desktop/Startups/rozx/api/prisma.config.ts) instead of `package.json` to make it compatible with Prisma 7.

## Decisions made
- **Constraint Separation**: Kept raw SQL check and exclusion constraints in a dedicated migration file separate from the baseline schema, allowing clean rollback and isolation of custom database-level rules.
- **Local Database Routing**: Identified port 5433 as the correct port for the local PostgreSQL service matching host credentials, resolving DB connectivity bottlenecks.

## Problems solved
- **Type-Safe Test Assertions**: Cleared all TypeScript compilation errors and linter warnings across spec suites, ensuring strict compliance checks (`npx tsc --noEmit` and `npm run test` pass 100%).

## Current state
- The database schema is fully validated.
- All 45 test suites (352 unit tests) pass.
- The NestJS project builds successfully (`npm run build`).

## Next session starts with
- Setting up secrets in staging and production, testing the deployment pipelines, or testing core booking integrations.

## Open questions
- None.
