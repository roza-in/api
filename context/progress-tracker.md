# Progress Tracker

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

---

## Current Status

**Phase:** Completed — Phase 10 — Settings & Auth Extensions
**Last completed:** 27 Subscription Gating & Limits Enforcement
**Next:** Production Ready (All 27 Features Completed)

---

## Progress

### Phase 1 — Foundation

- [x] 01 Project Bootstrap & Configuration
- [x] 02 Database Setup
- [x] 03 Redis & BullMQ Setup
- [x] 04 Authentication Module

### Phase 2 — Core Business Modules

- [x] 05 Business & Branch Module
- [x] 06 RBAC & Permissions Module
- [x] 07 Services Module
- [x] 08 Staff Module
- [x] 09 Customer Module

### Phase 3 — Appointment Engine

- [x] 10 Appointment Scheduling
- [x] 11 Availability Engine

### Phase 4 — Payment & Subscription

- [x] 12 Payment Processing
- [x] 13 Webhook Processing Module
- [x] 14 Subscription & Billing Module

### Phase 5 — Notifications & Communication

- [x] 15 Notification Orchestration

### Phase 6 — Website Builder Backend

- [x] 16 Website Module
- [x] 17 Publishing & Domain Module
- [x] 18 Public Booking API

### Phase 7 — Analytics & Reporting

- [x] 19 Analytics Module
- [x] 20 Export Module

### Phase 8 — Marketing & Admin

- [x] 21 Marketing Module
- [x] 22 Rozx Admin Module

### Phase 9 — Production Hardening

- [x] 23 Audit & Compliance
- [x] 24 Monitoring & Observability

### Phase 10 — Settings & Auth Extensions

- [x] 25 Security & Auth Extensions
- [x] 26 Settings Dashboard (Backend)

---

## Decisions Made During Build

- **JWT Expiration & Type Casting**: Access tokens expire in 15 minutes, and refresh tokens expire in 7 days. Dynamic `expiresIn` config values were cast `as any` to avoid TypeScript strict compatibility check against `StringValue` from the `ms` package.
- **Config Service Strictness**: Used `configService.getOrThrow` for critical authentication variables (`JWT_SECRET`, Google OAuth credentials/URLs) to guarantee types at compile time and fail early if they are missing.
- **Isolated Modules Compatibility**: Used type imports (`import type`) for interface parameter types (`Request`, `UserPayload`) within decorated controller methods to comply with `isolatedModules` and `emitDecoratorMetadata` constraints.
- **Redis Token Blacklisting**: Stored revoked refresh token JTIs with key prefix `auth:refresh:blacklist:` and auto-expiring TTLs matching the token's remaining time.
- **Google OAuth Integration**: Enabled `passport-google-oauth20` social authentication with a find-or-create pipeline that resolves accounts by email.
- **Business Registration Flow**: Combined Business, Branch, BusinessMember, and trial Subscription creations into an atomic `$transaction` block to guarantee data integrity. Re-issued a fresh JWT with the newly created business and member context to authenticate subsequent client requests immediately.
- **Dynamic Slug Generation**: Configured automatic slug generation from the business name with collision handling, appending numeric suffixes dynamically (e.g. `glow-studio-2`).
- **Jest Mocking for ESM**: Addressed a Jest SyntaxError on ES module export imports (caused by the `uuid` package) by declaring a global module mock at the top of the service test suite.
- **Service & Category Hierarchies & Mappings**: Supported parent-category relationships scoped to tenant business context, automated validation of linked staff and categories, and enforced soft-delete cascades of relational staff-service records within transaction blocks.
- **Jest Matcher Type Safety**: Handled strict linter check warnings for `expect.any(Date)` unsafe assignments using explicit eslint-disable comments, preserving clean tests and rules.
- **Operational Staff & Invitation Architecture**: Separated operational staff catalog record creation from login-user invitations. Invitations verify or create user profiles, establish business member linkage with system role `STAFF`, and queue asynchronous invite jobs into the `notifications` BullMQ queue.
- **Leaves Conflict & Time Validations**: Enforced chronological time checks on staff leave creation (`endTime > startTime`) and prevented overlapping leaves on the same staff profile using `ConflictException` guards.
- **Customer CRM Unique Phone Numbers**: Enforced unique phone numbers for customer profiles at the application layer scoped strictly per tenant business, preventing duplicate profile registration.
- **DPDP Act Anonymization on Soft-Delete**: Masked personal details (`name` to `'Anonymized Customer'`, `phone` to a scrambled value, and nullified `email`, `gender`, `birthday`, and `notes`) during customer soft deletion, keeping historical visits and `totalSpent` intact.
- **Spend Aggregation Sync helper**: Implemented a helper to sum successful payments from non-cancelled appointments, ready for future payment phase integrations.
- **Prisma JSON Type Safety for Working Hours**: Cast `branch.workingHours` and `staff.workingHours` from database Prisma JSON type to `unknown as WorkingHoursMap` to avoid linter `any` errors under strict TypeScript checks.
- **Timezone Hour Format Handling**: Corrected a Node `Intl.DateTimeFormat` hour12 formatting quirk that outputs `"24:00"` instead of `"00:00"` by sanitizing timezone helpers to output proper time ranges.
- **Public Scoping for Availability**: Explicitly omitted controller-level JWT guards on the appointments controller to allow public accessibility on `GET /appointments/availability`, while using route-level guards on private endpoints to secure them.
- **AES-256-GCM Secure Multi-Tenant Payment Configs**: Created `payment_configs` table supporting tenant-isolated config with keys encrypted using AES-256-GCM and system-level `DB_ENCRYPTION_KEY`.
- **Extensible Payment Gateway Adapter Pattern**: Standardized interface `PaymentAdapter` and concrete `RazorpayAdapter` using `razorpay` SDK, resolving the SDK refund method call safely (`this.razorpay.payments.refund`).
- **Dynamic Webhook Signature Verification and Idempotency**: Verified Razorpay webhooks dynamically at `/webhooks/razorpay/:businessId` using verified tenant webhook secrets, enforcing event idempotency via `WebhookEvent` provider event ID checks.
- **Asynchronous Invoice Generation & Spend Synchronization**: Processed `payment.captured` events via BullMQ asynchronously, generating sequential invoices (`INV-YYYY-XXXX`) and triggering customer lifetime spend synchronizations safely.
- **TypeScript & ESLint Warnings Elimination in Webhook Processing**: Added typed structures (`RazorpayWebhookPayload`, `RazorpayWebhookEventPayload`) to cast parsed JSON payloads safely, eliminating `any` and unsafe assignment errors.
- **Centralized Notification Engine & Adapters**: Implemented multi-channel adapters (WhatsApp, MSG91 SMS, Resend Email) with placeholder template interpolation and sliding 24-hour Redis rate limiting.
- **Consent-Driven Delivery**: Enforced strict DPDP explicit marketing opt-in checks and transactional implied opt-out rules prior to notification sending.
- **Synchronous Fallback & Status Webhooks**: Created immediate SMS fallback when WhatsApp delivery initialization fails, and extended webhooks to capture WhatsApp and MSG91 status callbacks.
- **Isolated Modules Decorated Parameters Fix**: Resolved decorated parameter warnings under `isolatedModules` by utilizing type-only imports (`import type { Request }`) for third-party interfaces.
- **Public Booking IP-based Rate Limiting**: Implemented unauthenticated endpoint protection using Redis rate limiting (throttled to 20 requests/minute for catalogs and 3 requests/minute for checkout creations) to prevent brute-force abuse of availability slots.
- **Transactional Customer Consent & Profile Resolution**: Consolidated CRM customer lookup/creation, profile email/name updates, and DPDP-compliant consent logging into an atomic database transaction.
- **Nullable User Auditing Fallback**: Designed the `AppointmentsService` creation signature to accept nullable user contexts, automatically resolving the tenant owner's user ID for guest bookings to satisfy audit log constraints.
- **"Any Staff" Selection Fallback**: Evaluated "Any Staff" assignments during checkout by dynamically filtering qualified active staff members and mapping them to the first match with time slot availability.
- **Multi-Tenant Analytics Engine & Caching**: Designed tenant-scoped dashboards (Owner, Manager, Reception, Staff) backed by dynamic Prisma aggregation queries and BullMQ-independent Redis caching (5-minute TTL, with custom OWNER/MANAGER bypass). Corrected timezone shift discrepancies in staff capacity calculation by resolving leave overlaps using local dates.
- **Multi-Tenant Report Exports & Background Workers**: Standardized appointments, revenue, and CRM customer reports in CSV, XLSX (via `exceljs`), and PDF (via `pdfkit`) formats in the `Asia/Kolkata` timezone with Indian date formats. Integrated asynchronous report generation via BullMQ `reports` queue, S3 media uploads, Redis-cached status indicators (24-hour TTL), and explicit `EXPORT` audit trail logging.
- **Marketing Campaign & 7-Day Attribution**: Created `MarketingModule` offering Campaign CRUD and BullMQ `campaigns` worker dispatch queue. Integrated DPDP opt-in consent and Redis-based rate limiting validation inside processor execution. Established 7-day revenue attribution mapping delivered campaign notifications to successfully captured payments.
- **Billing Interval & Amount on Subscription**: Added explicit `billingInterval` and `amount` fields to the `Subscription` table in the database schema. This secures recurring billing calculation values at charging time and safeguards the platform's MRR/ARR/ARPU dashboard metrics from future configuration drift or plan pricing changes, while ensuring provider-agnostic extensibility.
- **Platform Incident Logging & MTTR Metrics**: Standardized platform-wide incidents logging with severity metrics (`P1` - `P4`) and automated resolution durations calculation. Aggregated monthly incident parameters including mean time to resolution (MTTR) and customer satisfaction (CSAT) scores against system reliability SLA targets.
- **Bypass guards for Platform Admins**: Extended `TenantGuard` to allow platform-wide admins carrying `SYSTEM_ROLE_IDS.ADMIN` permissions to bypass tenant checks and securely perform global administrative modifications, business suspensions, and trial extensions.
- **DPDP Compliance, Consent, and Data Retention Policies**: Implemented a new `ComplianceModule` exposing REST APIs for customer consent tracking, synchronous personal data JSON exports uploaded directly to S3 with an `EXPORT` audit trail, and `DataDeletionRequest` (Right to be Forgotten) scheduling with a 30-day window. Integrated a daily BullMQ repeatable job (`compliance-daily-check`) that automatically executes deletion request anonymizations and purges non-financial tables for businesses cancelled for >12 months while permanently preserving financial logs.
- **Resilient Telemetry Interceptor**: Implemented a global `MonitoringInterceptor` that measures API request latency, volume, and error rates using Redis, running telemetry logging inside silent try/catch blocks to ensure that Redis failures or timeouts never interrupt or fail active client HTTP requests.
- **Unified Health Endpoint**: Configured a `GET /health` endpoint combining database queries (`SELECT 1`), Redis ping checks, and dynamically queried BullMQ `QueueHealthStatus` objects from the `QueueService`, outputting real-time API latency statistics and error rates.
- **Production Docker Containerization**: Configured a production-grade multi-stage `Dockerfile` (separating dependencies, building, and running) based on `node:22-alpine` for the NestJS API. Structured `docker-compose.yml` to orchestrate database migrations via a pre-requisite container execution step before booting the main application container, fully containerizing PostgreSQL and Redis for staging/production parity.
- **Automated AWS EC2 CI/CD Deployment**: Integrated a GitHub Actions workflow (`.github/workflows/ci-cd.yml`) that triggers on pushes to `staging` (Staging deploy) or `main` (Production deploy). The pipeline runs linter checks, Jest unit tests, NestJS build compilation, builds target images (`builder` for database migrations and `runner` for production API execution) pushing them to Docker Hub, and continuously deploys to target AWS EC2 instances via SSH.
- **Database Migration & Schema Audit Fixes**: Replaced orphan SQL migrations with a structured baseline migration, implemented custom check/exclusion constraints (including a double-booking prevention constraint using `btree_gist`), resolved lowercase mock enum discrepancies in unit tests, and standardized migrations seeding in `prisma.config.ts`.
- **Global URI Versioning with Version-Neutral Monitoring**: Configured NestJS URI-based versioning globally with a default version of `1` (prefixing standard routes under `/v1/`), while keeping monitoring (`/`) and health check (`/health`) endpoints version-neutral to prevent breaking E2E tests and monitoring tools.
- **WhatsApp Cloud API Integration & Webhook Security**: Added environment validation and support for `WHATSAPP_VERIFY_TOKEN` across staging and production configurations. Configured the staging endpoint Callback URL and verified token matching with the Meta Developer Portal for automated notifications and status callbacks.
- **WhatsApp-Only OTP Authentication & SMS Adapter Bypass**: Replaced MSG91 SMS OTP and fallbacks with WhatsApp Cloud API using Meta's copy-code authentication template structure, utilizing a unique database-compatible email format (`phone@rozx.in`) for phone-only signups to avoid breaking downstream business logic.
- **Hourly Reminder Scanning Scheduler**: Configured a BullMQ-backed repeatable cron job (`appointment-reminder-check`) running hourly, scanning and sending appointment notifications 24 hours prior to booking start times.
- **Strict Single Business Membership Constraint (Option B)**: Enforced a strict 1-to-1 relationship between User and BusinessMember at both the database level (swapping compound unique constraint on `[userId, businessId]` for a unique index on `[userId]`) and the application layer (validating during business registration and staff invitation to throw `BadRequestException` on existing membership).
- **Staging Database Migration Resolution**: Resolved a staging deployment blocking failure on the unique index migration by manually creating the unique index `business_members_userId_key` in the staging PostgreSQL database and marking the migration as applied using `prisma migrate resolve --applied`.
- **Staff Role Renaming & Role Selection**: Renamed system role `STAFF` to `PROFESSIONAL` in the database and code, added a `roleId` column to the `Staff` table (defaulting to the `PROFESSIONAL` system role), and integrated a role selection dropdown in the creation/editing forms. Implemented client-side mapping using `getRoleNameFromId` to cleanly map `roleId` system UUIDs to lowercase string roles in components (such as appointment creation, detail modals, and service assignment lists), avoiding backend changes to historical API schemas and ensuring type safety with 0 compiler errors.
- **Manual Migration for Staff RoleId**: Created a manual SQL database migration (`20260618231000_add_role_to_staff`) to add the missing `roleId` column and its foreign key constraint referencing the `roles` table on the `staff` table, resolving the runtime database crash on staging deployment.
- **System Role UUIDs Validation Compatibility**: Replaced the `@IsUUID()` decorator in `CreateStaffDto` with a regex-based `@Matches()` validation. This permits custom system role UUIDs (such as the default `PROFESSIONAL` role UUID ending in `0004` which uses version 0 and is rejected by standard v1-v5 spec checks) while maintaining strict format verification.
- **Auth Extensions & Verification Tests**: Injected and mocked `EmailAdapter` in `auth.service.spec.ts`, adding comprehensive unit tests for `sendForgotPasswordOtp`, `resetPassword`, `changePassword`, and `linkPhone` to ensure 100% test coverage and resolve CI/CD build issues.
- **Forgot Password email template**: Set up a custom HTML template for email OTP password recovery dispatching via SES, utilizing a 6-digit verification code with 10-minute validity.
- **Phone Number Linkage Uniqueness**: Implemented `linkPhone` to prevent multiple user accounts from linking the same WhatsApp phone number.
- **User Name Storage (Option 1)**: Added a nullable `name` column to the `User` model in the database schema. Updated user email registration and Google OAuth callback authentication to capture and store names, returning the field in `/auth/me` to enable correct name display on the dashboard sidebar and eliminate the email prefix fallback.
- **Razorpay Subscription Plan and Pricing Alignment**: Mapped new Razorpay dashboard test plan IDs (`plan_T3sHMSNQdKWSRg`, `plan_T3sJl4DeN3uCg1`, `plan_T3sKnvAUY2Rwoo`, `plan_T3sT2tatdqbSPv`, `plan_T3sTyorHgQ7eSe`, `plan_T3sUykwmvgxc9B`) under environment configuration variables `RAZORPAY_PLAN_*` in both `.env` and `.env.staging`. Updated the database seed script `seed.ts` with matching plan yearly price structures (₹9,999, ₹19,999, ₹29,999) and successfully seeded the updated plans into the PostgreSQL instance.
- **Subscription Gating & Route Protection**: Enforced subscription plan feature requirements globally across premium modules by applying `SubscriptionGuard` and `@RequireFeature` at the controller levels (Analytics, Campaigns, custom domains, pages, themes, and media asset builders). Additionally, integrated the billing-period appointment limit check (`assertAppointmentLimit`) into the core booking path (`createAppointment`) to block booking requests for expired/limit-exceeded businesses.
- **Test Suite Telemetry and Mock Diagnostics**: Resolved mock telemetry warnings and TypeError logs in the `AppointmentsService` unit spec file by injecting missing business relationship attributes, ensuring 100% clean log outputs across all 380 passing test cases.
- **Subscription Renewal & Expiring Reminders Engine**: Integrated the email triggers for `TRIAL_REMINDER` and `SUBSCRIPTION_RENEWAL` templates. Enabled `SubscriptionExpiryProcessor` to run daily and scan for subscriptions or trials expiring in exactly 3 days, notifying the business owner via SES email. Integrated a successful renewal email dispatch inside the `subscription.charged` webhook handler (`handleSubscriptionCharged`), fully covered by updated unit specs (all 381 tests passing cleanly).


---

## Notes

- Strict TypeScript mode (`noImplicitAny: true`) was enabled in `tsconfig.json` as per coding standards.
- Replaced custom logger (`console.log`) in `main.ts` with NestJS `Logger`.
- All authentication endpoints are fully documented with Swagger decorators under the `Authentication` tag.
