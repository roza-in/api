# Architecture

## Stack

| Layer              | Tool                    | Purpose                                        |
|--------------------|-------------------------|------------------------------------------------|
| Framework          | NestJS 11               | Backend API framework                          |
| Language           | TypeScript (strict)     | Throughout                                     |
| Database           | PostgreSQL (AWS RDS)    | Primary data store (Mumbai ap-south-1)     |
| ORM                | Prisma                  | Database access, migrations, type-safe client  |
| Cache / Queues     | Redis                   | Caching, session store, rate limiting          |
| Job Queue          | BullMQ                  | Background jobs, retries, dead letter queues   |
| Auth               | JWT + Passport          | Authentication and session management          |
| Validation         | class-validator + DTOs  | Request validation                             |
| Payments           | Razorpay SDK            | Payment processing, subscriptions              |
| WhatsApp           | Meta Business API       | Notifications, marketing campaigns             |
| SMS                | MSG91 API               | OTP, reminder fallback                         |
| Email              | Resend                  | Transactional emails                           |
| Storage            | AWS S3                  | Media uploads, exports                         |
| CDN                | CloudFront              | Media delivery                                 |
| SSL                | Let's Encrypt           | Custom domain certificates                     |
| Testing            | Jest + Supertest        | Unit, integration, E2E tests                   |
| Linting            | ESLint + Prettier       | Code quality                                   |

---

## Folder Structure

```
api/
├── AGENTS.md
├── context/
│   ├── project-overview.md
│   ├── architecture.md
│   ├── code-standards.md
│   ├── library-docs.md
│   ├── build-plan.md
│   └── progress-tracker.md
├── prisma/
│   ├── schema.prisma                       → All Prisma models, enums, indexes
│   ├── seed.ts                             → Seed data (plans, roles, permissions)
│   └── migrations/                         → Auto-generated migration files
├── src/
│   ├── main.ts                             → Bootstrap, global pipes, CORS, Swagger
│   ├── app.module.ts                       → Root module — imports all feature modules
│   ├── config/
│   │   ├── env.validation.ts              → Environment variable validation schema
│   │   ├── redis.config.ts                 → Redis connection config
│   │   ├── razorpay.config.ts              → Razorpay API keys
│   │   ├── whatsapp.config.ts              → WhatsApp Business API config
│   │   ├── msg91.config.ts                 → MSG91 API config
│   │   ├── email.config.ts                 → Resend / SES config
│   │   ├── storage.config.ts               → AWS S3 config
│   │   └── jwt.config.ts                   → JWT secret, expiry config
│   ├── common/
│   │   ├── decorators/                     → Custom decorators (CurrentUser, Roles, etc.)
│   │   ├── filters/                        → Global exception filters
│   │   ├── guards/                         → Auth guard, Roles guard, Subscription guard
│   │   ├── interceptors/                   → Logging, transform, audit interceptors
│   │   ├── middleware/                      → Tenant context, rate limiting
│   │   ├── pipes/                          → Validation pipes
│   │   ├── dto/                            → Shared DTOs (pagination, response wrapper)
│   │   ├── interfaces/                     → Shared interfaces
│   │   ├── constants/                      → App-wide constants
│   │   └── utils/                          → Shared utility functions
│   ├── modules/
│   │   ├── prisma/                         → Global Prisma module
│   │   │   ├── prisma.module.ts           → @Global() module exporting PrismaService
│   │   │   └── prisma.service.ts          → PrismaClient + soft-delete extension
│   │   ├── auth/                           → Authentication module
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/                 → JWT, Google OAuth strategies
│   │   │   ├── guards/                     → Auth-specific guards
│   │   │   └── dto/                        → Login, register, refresh DTOs
│   │   ├── business/                       → Business management module
│   │   │   ├── business.module.ts
│   │   │   ├── business.controller.ts
│   │   │   ├── business.service.ts
│   │   │   └── dto/
│   │   ├── staff/                          → Staff management module
│   │   ├── services/                       → Service catalog module
│   │   ├── appointments/                   → Appointment engine module
│   │   │   ├── appointments.module.ts
│   │   │   ├── appointments.controller.ts
│   │   │   ├── appointments.service.ts
│   │   │   ├── availability.service.ts     → Availability calculation engine
│   │   │   ├── conflict.service.ts         → Double booking prevention
│   │   │   └── dto/
│   │   ├── customers/                      → Customer CRM module
│   │   ├── payments/                       → Payment processing module
│   │   │   ├── payments.module.ts
│   │   │   ├── payments.controller.ts
│   │   │   ├── payments.service.ts
│   │   │   ├── adapters/                   → Razorpay adapter (provider abstraction)
│   │   │   └── dto/
│   │   ├── subscriptions/                  → Subscription & billing module
│   │   │   ├── subscriptions.module.ts
│   │   │   ├── subscriptions.controller.ts
│   │   │   ├── subscriptions.service.ts
│   │   │   ├── entitlements.service.ts     → Feature gating logic
│   │   │   └── dto/
│   │   ├── webhooks/                       → Webhook processing module
│   │   │   ├── webhooks.module.ts
│   │   │   ├── webhooks.controller.ts      → Razorpay, WhatsApp, MSG91 endpoints
│   │   │   ├── razorpay-webhook.service.ts
│   │   │   ├── whatsapp-webhook.service.ts
│   │   │   └── msg91-webhook.service.ts
│   │   ├── notifications/                  → Notification orchestration module
│   │   │   ├── notifications.module.ts
│   │   │   ├── notifications.service.ts    → Channel selection, delivery orchestration
│   │   │   ├── adapters/                   → WhatsApp, SMS, Email adapters
│   │   │   ├── templates/                  → Message template definitions
│   │   │   └── dto/
│   │   ├── website-builder/                → Website builder backend module
│   │   │   ├── website-builder.module.ts
│   │   │   ├── websites.controller.ts
│   │   │   ├── pages.controller.ts
│   │   │   ├── domains.controller.ts
│   │   │   ├── websites.service.ts
│   │   │   ├── pages.service.ts
│   │   │   ├── domains.service.ts
│   │   │   ├── publishing.service.ts       → Validation, build, publish flow
│   │   │   └── dto/
│   │   ├── analytics/                      → Analytics & reporting module
│   │   │   ├── analytics.module.ts
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts        → Metric calculations (one formula per metric)
│   │   │   ├── exports.service.ts          → CSV, Excel, PDF generation
│   │   │   └── dto/
│   │   ├── marketing/                      → Marketing campaigns module
│   │   ├── booking/                        → Public booking API module (no auth required)
│   │   │   ├── booking.module.ts
│   │   │   ├── booking.controller.ts       → Public endpoints: /booking/:slug/*
│   │   │   └── booking.service.ts
│   │   └── admin/                          → Rozx internal admin module
│   │       ├── admin.module.ts
│   │       ├── admin.controller.ts
│   │       ├── admin.service.ts            → MRR, ARR, churn, platform metrics
│   │       └── dto/
│   └── integrations/                       → Third-party integration adapters
│       ├── razorpay/
│       │   ├── razorpay.module.ts
│       │   ├── razorpay.service.ts         → Razorpay API adapter
│       │   └── razorpay.types.ts
│       ├── whatsapp/
│       │   ├── whatsapp.module.ts
│       │   ├── whatsapp.service.ts         → WhatsApp Business API adapter
│       │   └── whatsapp.types.ts
│       ├── msg91/
│       │   ├── msg91.module.ts
│       │   ├── msg91.service.ts            → MSG91 SMS adapter
│       │   └── msg91.types.ts
│       ├── email/
│       │   ├── email.module.ts
│       │   ├── email.service.ts            → Resend / AWS SES adapter
│       │   └── email.types.ts
│       └── storage/
│           ├── storage.module.ts
│           ├── storage.service.ts          → AWS S3 upload/download
│           └── storage.types.ts
├── test/
│   ├── jest-e2e.json
│   ├── app.e2e-spec.ts
│   └── factories/                          → Test data factories
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── nest-cli.json
└── .env.example
```

---

## System Boundaries

| Folder              | Owns                                                                              |
|----------------------|-----------------------------------------------------------------------------------|
| `src/config/`        | Configuration loading and validation. No business logic.                          |
| `src/common/`        | Shared decorators, guards, filters, interceptors, pipes, DTOs, utilities.         |
| `src/modules/`       | Feature modules. Each module owns its own controller, service, entities, DTOs.    |
| `src/integrations/`  | Third-party API adapters only. No business logic — just API communication.        |
| `test/`              | Test files, E2E specs, test factories and fixtures.                               |

---

## Data Flow

### API Request (Standard)

```
Client Request
    ↓
Global Middleware (CORS, rate limit, tenant context)
    ↓
Auth Guard (JWT verification)
    ↓
Roles Guard (RBAC check)
    ↓
Subscription Guard (entitlement check)
    ↓
Validation Pipe (DTO validation)
    ↓
Controller (route handling, no business logic)
    ↓
Service (business logic, DB operations)
    ↓
Entity / Repository (database access)
    ↓
Response Interceptor (standard response wrapper)
    ↓
Client Response
```

### Webhook Processing

```
Provider (Razorpay/WhatsApp/MSG91) sends webhook
    ↓
Webhook Controller (signature verification)
    ↓
Idempotency check (provider_event_id)
    ↓
BullMQ Queue (async processing)
    ↓
Webhook Service (process event)
    ↓
Business Logic Service (update records)
    ↓
Notification Service (if needed)
    ↓
Audit Log
```

### Background Job Processing

```
Event triggers job (appointment created, payment received, etc.)
    ↓
BullMQ Queue (named queue per job type)
    ↓
Worker processes job
    ↓
Retry on failure (1min → 5min → 15min → 1hr → DLQ)
    ↓
Dead Letter Queue on final failure
    ↓
Manual review
```

### Public Booking API

```
Customer visits booking website
    ↓
GET /booking/:slug (no auth required)
    ↓
GET /booking/:slug/services
    ↓
GET /booking/:slug/staff
    ↓
GET /booking/:slug/availability
    ↓
POST /booking/:slug/appointments
    ↓
Notification sent to business + customer
```

---

## Multi-Tenancy

Rozx uses **row-level tenant isolation**:

- Every business-scoped entity has a `business_id` column
- Every database query must filter by `business_id`
- Tenant context is extracted from JWT and injected via middleware
- Cross-tenant data access is **never allowed** except for Rozx admin operations

---

## Authentication Architecture

| Method         | Flow                                              |
|----------------|---------------------------------------------------|
| Email + OTP    | Primary business login                             |
| Google OAuth   | Social login for business owners                   |
| JWT Access     | Short-lived token for API access                   |
| JWT Refresh    | Long-lived token for session renewal               |
| Password Reset | OTP-based reset flow                               |

**Token Lifecycle:**
```
Login → Access Token (15min) + Refresh Token (7 days)
    ↓
Access Token expires
    ↓
Client sends Refresh Token
    ↓
New Access Token + New Refresh Token (rotation)
    ↓
Old Refresh Token invalidated
```

---

## RBAC Model

Rozx uses a **join-table based RBAC** system for enterprise flexibility:

```
User ↔ BusinessMember ↔ Business
                ↕
              Role ↔ RolePermission ↔ Permission
                ↕
              Staff (optional — only for operational staff)
```

- **User**: Authentication identity (email, password, OAuth, MFA).
- **BusinessMember**: Links a User to a Business with a specific Role. A User can be a member of exactly one business (enforces Option B).
- **Role**: Can be system-defined (Owner, Manager, Reception, Professional) or business-custom.
- **Permission**: Granular action (e.g. `appointment:create`, `payment:refund`).
- **Staff**: Operational profile linked to BusinessMember (schedule, skills, salary). Not all BusinessMembers are Staff.

| Role       | Scope              | Permissions                                    |
|------------|--------------------|-------------------------------------------------|
| Owner      | Business-wide      | Full access to all features                     |
| Manager    | Branch-level       | Staff, appointments, customers, reports         |
| Reception  | Branch-level       | Appointments, check-in, payments                |
| Professional | Own appointments | View own schedule, mark complete                |
| Rozx Admin | Platform-wide      | MRR, ARR, business management, system health    |

---

## Subscription & Entitlements

Subscription determines feature access:

```
Business subscribes to Plan
    ↓
Plan defines Entitlements
    ↓
Subscription Guard checks entitlements on each request
    ↓
Feature allowed or blocked with upgrade prompt
```

Entitlement examples:
- Max branches per business
- Max staff per branch
- Online booking enabled
- Marketing campaigns enabled
- Custom domain enabled
- Analytics depth

---

## Key Database Entities

| Entity              | Key Fields                                                    |
|----------------------|---------------------------------------------------------------|
| User                 | email, passwordHash, oauthProvider, status, lastLogin        |
| BusinessMember       | userId, businessId, roleId                                   |
| Role                 | name, businessId (nullable for system roles), isSystem       |
| Permission           | name (e.g. `appointment:create`), description                |
| RolePermission       | roleId, permissionId (composite PK)                          |
| Business             | name, slug, planId, subscriptionStatus, trialEndsAt          |
| Branch               | businessId, name, address, timezone, workingHours            |
| Staff                | businessId, branchId, memberId, skills, workingHours, version |
| ServiceCategory      | businessId, name, parentCategoryId (nullable for flat V1)    |
| Service              | businessId, categoryId, name, duration, price, bufferTime, version |
| StaffService         | staffId, serviceId (composite PK)                            |
| Customer             | businessId, name, phone, email, totalSpent, version          |
| Appointment          | businessId, branchId, staffId, customerId, serviceId, status, startTime, endTime, version |
| Payment              | businessId, appointmentId, amount, status, providerPaymentId (immutable) |
| Refund               | businessId, paymentId, amount, status, providerRefundId (immutable) |
| Invoice              | businessId, appointmentId, invoiceNumber, amount (immutable) |
| Subscription         | businessId, planId, status, currentPeriodStart/End           |
| SubscriptionPlan     | name, slug, maxBranches, maxStaff, priceMonthly/Yearly       |
| Website              | businessId, themeId, subdomain, customDomain, domainStatus   |
| Page                 | websiteId, title, slug, type, contentJson, seoTitle/Description |
| Theme                | name, colorsJson, typographyJson, isSystem, businessId       |
| Domain               | websiteId, hostname, status, sslStatus                       |
| WebhookEvent         | provider, eventType, providerEventId, payload, status (immutable) |
| AuditLog             | businessId, userId, action, entity, entityId, metadata (immutable) |
| Notification         | businessId, customerId, channel, status, provider            |
| Leave                | businessId, staffId, startTime, endTime                      |
| Review               | businessId, customerId, rating, comment, isApproved          |
| Campaign             | businessId, name, channel, status, sentCount, deliveredCount |
| Membership           | businessId, name, price, durationMonths                      |
| Package              | businessId, name, price, servicesJson                        |
| Inventory            | businessId, name, sku, stockLevel, reorderPoint              |
| Consent              | businessId, customerId, consentType, source, version (DPDP)  |
| MediaAsset           | businessId, websiteId, fileUrl, fileType, sizeBytes          |

---

## Audit Trail & Optimistic Locking

Every business entity (Appointment, Service, Customer, Staff) includes:
- `createdBy` (UUID) — User who created the record
- `updatedBy` (UUID) — User who last updated the record
- `version` (Int, default 1) — Incremented on every update for optimistic concurrency control

Immutable entities (Payment, Refund, Invoice, AuditLog, WebhookEvent) do **not** have soft deletes or version fields.

---

## Soft Delete Strategy

Implemented via a **Prisma Client Extension** that automatically appends `{ deletedAt: null }` to read queries.

**Excluded from soft deletes (immutable):**
- AuditLog
- Payment
- Refund
- Invoice
- WebhookEvent

---

## Invariants

Rules that must never be violated:

- Controllers contain no business logic — only route handling and DTO validation
- Services contain all business logic — controllers delegate to services
- Integration adapters never contain business logic — only API communication
- Every database query on business data must include `businessId` filter
- All webhook processing must be idempotent — check `providerEventId` before processing
- Never trust client-side payment confirmation — only trust webhook-verified events
- All secrets stored in environment variables — never in source code
- Appointment availability always calculated from the Availability Engine — never cached
- Soft-deleted records excluded from queries by default (via Prisma extension)
- Financial records (payments, invoices, audit logs) are never hard-deleted
- Every integration must have an adapter — business logic never imports provider SDKs directly
- All notification sending goes through the Notification Service — never send directly from feature modules
- User-to-Business membership uses `BusinessMember` join table — never hardcode User→Business directly
