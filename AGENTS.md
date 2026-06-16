# Rozx API Server — Agent Rules

## Read Before Anything Else

Read in this exact order before any implementation:

1. context/project-overview.md
2. context/architecture.md
3. context/code-standards.md
4. context/library-docs.md
5. context/build-plan.md
6. context/progress-tracker.md

## Rules That Never Change

- This is a **NestJS 11 backend API** — no frontend code belongs here
- Never put business logic in controllers — always in services
- Every module follows NestJS modular architecture: `module → controller → service → entity`
- Every integration uses an **adapter pattern** — business logic never talks directly to provider SDKs
- All webhook processing must be **idempotent** — store and check `provider_event_id`
- Every database query must be **tenant-scoped** — always filter by `business_id`
- Never hardcode secrets — use `@nestjs/config` with environment variables
- Update `progress-tracker.md` after every completed feature
- Before any third-party library — read `context/library-docs.md` for project-specific rules
- If the same problem persists after one corrective prompt — stop immediately and run /recover

## Available Skills

- `/architect` — before any complex feature. Think before building.
- `/review` — before demo or when something feels off.
- `/recover` — when something breaks after one failed correction.
- `/remember save` — when a feature spans multiple sessions.
- `/remember restore` — when returning after a multi-session feature.