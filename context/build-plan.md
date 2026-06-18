# Build Plan

## Core Principle

Build in phases following dependency order. Each phase delivers testable, working functionality. Critical business modules first — revenue-generating features before nice-to-haves. Every module must be verified with tests before moving to the next.

---

## Phase 1 — Foundation

### 01 Project Bootstrap & Configuration

Set up the NestJS project foundation with all global configuration.

**Tasks:**

- Configure `@nestjs/config` with `.env` validation using Joi or class-validator
- Set up global validation pipe (`ValidationPipe` with `whitelist: true, transform: true`)
- Set up global exception filter (consistent error response format)
- Set up `helmet` for security headers
- Set up CORS configuration for web dashboard and booking site origins
- Create `.env.example` with all required variables
- Set up Swagger (`@nestjs/swagger`) for API documentation

---

### 02 Database Setup

PostgreSQL database (AWS RDS Mumbai) with Prisma and migrations.

**Tasks:**

- Configure Prisma with PostgreSQL connection (AWS RDS Mumbai ap-south-1)
- Create `prisma/schema.prisma` with all models
- Create `BaseModel` fields pattern: `id`, `createdAt`, `updatedAt`, `deletedAt`
- Set up Prisma migration infrastructure (`npx prisma migrate dev`)
- Create initial migration with core entities:
  - `businesses`, `branches`, `users`, `services`, `staff`
  - `customers`, `appointments`, `payments`, `refunds`
  - `subscriptions`, `invoices`, `plans`
  - `websites`, `pages`, `domains`, `themes`
  - `notifications`, `audit_logs`, `webhook_events`
- Seed initial data: subscription plans, default theme

---

### 03 Redis & BullMQ Setup

Redis connection and job queue infrastructure.

**Tasks:**

- Configure Redis connection via `@nestjs/config`
- Set up BullMQ with named queues:
  - `notifications` — WhatsApp, SMS, Email delivery
  - `webhooks` — Async webhook processing
  - `reports` — Report generation
  - `domain-verification` — DNS verification polling
- Create queue dashboard endpoint for monitoring (Bull Board)
- Configure retry strategies per queue

---

### 04 Authentication Module

Complete auth system with JWT and Google OAuth.

**Tasks:**

- Create `auth` module with controller, service
- Implement email + OTP login flow
- Implement Google OAuth via Passport
- JWT access token (15min) + refresh token (7 days) generation
- Refresh token rotation — invalidate old token on refresh
- Password reset flow (OTP-based)
- Session management with Redis-backed token blacklist
- Create `JwtAuthGuard` (global)
- Create `@CurrentUser()` decorator
- Middleware to extract tenant context from JWT

**Must Verify:**
- Login, logout, refresh token rotation, session expiry, password reset

---

## Phase 2 — Core Business Modules

### 05 Business & Branch Module

Multi-tenant business management.

**Tasks:**

- Create `business` module — CRUD for businesses
- Create `branch` module — CRUD for branches within a business
- Business registration flow: create business → create default branch → assign owner
- Business slug generation and validation
- Working hours configuration per branch
- Timezone support per branch (default: Asia/Kolkata)

---

### 06 RBAC & Permissions Module

Role-based access control with tenant isolation.

**Tasks:**

- Define roles enum: `OWNER`, `MANAGER`, `RECEPTION`, `PROFESSIONAL`, `ROZX_ADMIN`
- Create `RolesGuard` — checks user role against required roles
- Create `@Roles()` decorator
- Create `SubscriptionGuard` — checks business entitlements
- Implement tenant isolation middleware — every query scoped to `businessId`
- Permission matrix:
  - Owner: full access
  - Manager: branch-level management
  - Reception: appointments, check-in, payments
  - Professional: own schedule only

**Must Verify:**
- RBAC, entitlements, tenant isolation

---

### 07 Services Module

Service catalog management.

**Tasks:**

- Create `services` module — CRUD for business services
- Fields: name, description, duration, price, category, buffer_time, is_active
- Category management
- Service pricing rules
- Service-staff assignment (which staff can perform which services)

---

### 08 Staff Module

Staff management with schedules.

**Tasks:**

- Create `staff` module — CRUD for staff members
- Staff schedule configuration (working days, hours per day)
- Leave management (leave dates, leave schedules)
- Staff-branch assignment
- Staff-service assignment
- Staff invite flow (invite by phone/email)

---

### 09 Customer Module

Customer CRM.

**Tasks:**

- Create `customers` module — CRUD for customer profiles
- Customer fields: name, phone, email, gender, birthday, notes
- Visit history (linked to appointments)
- Total spent calculation
- Customer search and filtering
- Soft delete with data anonymization support

---

## Phase 3 — Appointment Engine (Critical)

### 10 Appointment Scheduling

Core appointment creation with conflict detection.

**Tasks:**

- Create `appointments` module with full CRUD
- **Conflict detection service:**
  - No double bookings for same staff at same time
  - Staff availability respected (working hours)
  - Branch hours respected
  - Service duration + buffer time respected
  - Leave schedules respected
- Appointment statuses: `confirmed`, `completed`, `cancelled`, `no_show`, `rescheduled`
- Appointment rescheduling flow
- Appointment cancellation with reason

**Must Verify:**
- No double bookings
- Staff availability respected
- Branch hours respected
- Service duration respected
- Buffer times respected
- Leave schedules respected

---

### 11 Availability Engine

Calculate available time slots for booking.

**Tasks:**

- `AvailabilityService` — calculates available slots for a given staff/service/date
- Inputs: staffId, serviceId, date, branchId
- Considers: staff schedule, existing appointments, buffer times, leave, branch hours
- Returns: array of available `{ startTime, endTime }` slots
- **Never cache availability** — always calculate fresh
- Public API: `GET /booking/:slug/availability`

---

## Phase 4 — Payment & Subscription (Critical)

### 12 Payment Processing

Razorpay integration for business-to-customer payments.

**Tasks:**

- Create `payments` module
- Create `RazorpayAdapter` in `src/integrations/razorpay/`
- Payment link creation
- Payment verification via webhooks only
- Invoice generation
- Refund processing
- Revenue tracking (gross revenue, net revenue, refund amount)
- Receipt generation

**Must Verify:**
- Successful payment, failed payment, duplicate webhook, refund processing, reconciliation

---

### 13 Webhook Processing Module

Centralized webhook handling for all providers.

**Tasks:**

- Create `webhooks` module
- Razorpay webhook handler with signature verification
- WhatsApp webhook handler with signature verification
- MSG91 webhook handler
- Idempotency: store `provider_event_id`, reject duplicates
- Async processing via BullMQ queue
- Dead letter queue for failed processing
- Raw payload storage for debugging

**Must Verify:**
- Valid signature, invalid signature, duplicate events, out-of-order events, provider retries

---

### 14 Subscription & Billing Module

Rozx subscription management.

**Tasks:**

- Create `subscriptions` module
- Define subscription plans: Free, Starter, Growth, Enterprise
- Entitlements per plan (max branches, max staff, features enabled)
- `EntitlementsService` — feature gating logic
- Trial management (90-day pilot, expiry handling)
- Upgrade/downgrade flows with proration
- Cancellation with grace period
- Billing cycle management
- `SubscriptionGuard` — checks entitlements on each request

**Must Verify:**
- Trial start, trial expiry, upgrade, downgrade, proration, cancellation, grace period

---

## Phase 5 — Notifications & Communication

### 15 Notification Orchestration

Multi-channel notification system.

**Tasks:**

- Create `notifications` module
- Channel selection logic: In-App → WhatsApp → Email → SMS
- WhatsApp adapter (`src/integrations/whatsapp/`)
- SMS adapter (`src/integrations/msg91/`)
- Email adapter (`src/integrations/email/`)
- Message template system with variable substitution
- Delivery status tracking
- Communication log
- Opt-in/opt-out consent management
- Rate limiting: max 5 transactional/day, max 2 marketing/day per customer

**Templates:**
- Appointment confirmation, reminder (24hr before), rescheduled, cancelled
- Payment receipt
- Trial reminder, subscription renewal, payment failure
- Security alerts

**Fallback chain:**
- WhatsApp → SMS (for transactional)
- Resend → AWS SES (for email)

---

## Phase 6 — Website Builder Backend

### 16 Website Module

Website creation and management.

**Tasks:**

- Create `website-builder` module
- Website CRUD (one website per business)
- Page management (Home, Services, Staff, About, Contact, Reviews, Policies)
- Section system with `content_json` storage
- Theme management (Modern, Luxury, Minimal, Beauty, Wellness)
- Theme customization (colors, logo, typography — no custom HTML/CSS/JS)
- Media upload for website images (via Storage service)

---

### 17 Publishing & Domain Module

Website publishing workflow and custom domain management.

**Tasks:**

- Publish validation (business name, at least one service, contact info, theme assigned)
- Version tracking (v1, v2, v3...) with rollback support
- Publishing statuses: Draft → Published → Archived
- Custom domain management:
  - Domain CNAME verification
  - DNS validation
  - SSL provisioning (Let's Encrypt)
  - Domain statuses: Pending → Verified → SSL Provisioning → Active → Failed
- Default domain: `businessslug.rozx.in`
- SEO data per page (title, meta description, OG image, canonical URL)
- Automatic sitemap and robots.txt generation

---

### 18 Public Booking API

Customer-facing booking endpoints (no auth required).

**Tasks:**

- Create `booking` module with public endpoints:
  - `GET /booking/:slug` — business info
  - `GET /booking/:slug/services` — service catalog
  - `GET /booking/:slug/staff` — staff list
  - `GET /booking/:slug/availability` — available time slots
  - `POST /booking/:slug/appointments` — create appointment
- Rate limiting on public endpoints
- Spam protection
- Customer consent collection
- Booking confirmation notification trigger

---

## Phase 7 — Analytics & Reporting

### 19 Analytics Module

Business metrics and dashboard data.

**Tasks:**

- Create `analytics` module
- **Revenue metrics** (one formula per metric — one metric, one formula, always):
  - Gross Revenue: `SUM(payments.amount) WHERE status = completed` — includes service payments, membership sales, package sales, product sales. Excludes refunds, failed, pending, cancelled.
  - Net Revenue: `Gross Revenue - Refund Amount` — **this is the primary revenue metric shown to business owners**
  - Refund Amount: `SUM(refunds.amount) WHERE status = processed` — excludes pending refunds
- **Appointment metrics:**
  - Total Appointments: `COUNT(appointments)` — includes completed, confirmed, cancelled, no_show
  - Completed: `COUNT(*) WHERE status = completed`
  - Cancellation Rate: `(Cancelled / Total) × 100`
  - No-Show Rate: `(No Show / Total) × 100`
  - Avg Appointments Per Day: `Completed / Days In Period`
- **Customer metrics:**
  - Total Customers: `COUNT(customers)` — excludes soft-deleted
  - New Customers: customers created during period
  - Returning Customers: customer with >1 completed appointment
  - Repeat Rate: `(Returning / Total) × 100`
  - CLV (MVP): `Total Customer Revenue / Total Customers` (simple — advanced CLV deferred)
- **Staff metrics:**
  - Revenue Per Staff: `Completed Revenue / Active Staff Count`
  - Staff Utilization: `(Booked Hours / Available Hours) × 100`
  - Appointments Per Staff: `Completed Appointments / Staff Count`
- **Growth metrics:**
  - Monthly Revenue Growth: `((Current Month - Previous Month) / Previous Month) × 100`
  - Customer Growth: `((New This Month - New Last Month) / Last Month Customers) × 100`
- **Marketing metrics:**
  - Campaign Sent: count of messages sent
  - Delivery Rate: `(Delivered / Sent) × 100`
  - Click Through Rate: `(Clicks / Delivered) × 100`
  - Campaign Revenue: revenue attributed to campaign (7-day attribution window)

**Dashboard Endpoints (5 dashboards):**

**Owner Dashboard** (primary view, refresh every 5 min):
- Today's Appointments, Today's Revenue, Monthly Revenue, New Customers
- Repeat Customer Rate, Staff Utilization, Recent Activity, Upcoming Appointments

**Manager Dashboard** (refresh every 5 min):
- Today's Schedule, Staff Availability, Appointments Today
- Pending Payments, Customer Follow-Ups

**Reception Dashboard** (real-time refresh):
- Current Day Calendar, Upcoming Appointments, Check-In Queue, Payment Collection Status

**Staff Dashboard** (refresh every 5 min):
- Today's Appointments, Upcoming Services, Performance Summary, Availability Status

**Rozx Admin Dashboard** (refresh hourly):
- MRR, ARR, Active Businesses, Trial Businesses
- Subscription Growth, Platform Revenue, Churn, System Health

**Data freshness SLAs:**
- Appointments: near real-time (max 30 seconds)
- Payments: near real-time (max 60 seconds)
- Dashboard metrics: max 5 minutes
- Analytics reports: max 15 minutes
- Financial reports: max 30 minutes (accuracy prioritized over speed)
- Subscription metrics: updated hourly

**Reporting rules:**
- Soft-deleted records excluded by default
- Cancelled appointments included only where explicitly defined
- Refunds always deducted from Net Revenue
- Trial businesses excluded from business revenue reports, included in Rozx platform analytics
- Every generated report logs: report_id, user_id, business_id, filters, generated_at, file_type

---

### 20 Export Module

Report generation and export.

**Tasks:**

- CSV, Excel (XLSX), PDF export support
- Date format: DD-MM-YYYY
- Timezone: Asia/Kolkata
- Currency: INR
- Export metadata: generated_at, generated_by, date_range, filters
- Audit logging for every generated report
- Background generation via BullMQ for large reports

---

## Phase 8 — Marketing & Admin

### 21 Marketing Module

Campaign management.

**Tasks:**

- Campaign CRUD (WhatsApp campaigns)
- Template management
- Customer consent tracking
- Campaign metrics: sent, delivery rate, CTR, campaign revenue (7-day attribution)
- Rate limiting enforcement

---

### 22 Rozx Admin Module

Platform administration (internal use only).

**Tasks:**

- Admin-only endpoints (Rozx Admin role)
- **Subscription metrics** (exact formulas):
  - MRR (Monthly Recurring Revenue): `SUM(active monthly subscription values)`
  - ARR (Annual Recurring Revenue): `MRR × 12`
  - ARPU (Average Revenue Per User): `MRR / Active Businesses`
  - Churn Rate: `(Cancelled Businesses / Active Businesses) × 100`
- Active/trial business counts and breakdown
- Subscription growth tracking (new, upgrades, downgrades, cancellations)
- System health dashboard (API status, queue health, provider status)
- Business management (suspend, activate, extend trial)
- Service status page data:
  - API Status, Payments, Booking Engine, Notifications, Website Publishing, Infrastructure
  - Statuses: Operational / Degraded / Partial Outage / Major Outage / Maintenance

**Incident Metrics (track monthly):**
- P1 Count, P2 Count, Average Response Time, Average Resolution Time
- Customer Satisfaction Score, Repeat Incidents, MTTR
- Targets: P1 MTTR under 4 hours, P2 MTTR under 1 business day, satisfaction 90%+

---

## Phase 9 — Production Hardening

### 23 Audit & Compliance

Legal and compliance features.

**Tasks:**

- Consent tracking system (timestamp, source, consent type)
- Data export endpoint (DPDP Act compliance)
- Data deletion/anonymization workflow (30-day processing window)
- Data retention rules (12 months for cancelled businesses)
- Financial record retention (permanent)
- Communication record retention

---

### 24 Monitoring & Observability

Production monitoring.

**Tasks:**

- Health check endpoint (`GET /health`)
- Service status page data
- Error rate tracking
- API latency monitoring
- Queue monitoring (pending, active, failed jobs)
- Incident severity classification (P1–P4)

---

## Feature Count

| Phase                              | Features |
|------------------------------------|----------|
| Phase 1 — Foundation               | 4        |
| Phase 2 — Core Business            | 5        |
| Phase 3 — Appointment Engine       | 2        |
| Phase 4 — Payment & Subscription   | 3        |
| Phase 5 — Notifications            | 1        |
| Phase 6 — Website Builder Backend  | 3        |
| Phase 7 — Analytics & Reporting    | 2        |
| Phase 8 — Marketing & Admin        | 2        |
| Phase 9 — Production Hardening     | 2        |
| **Total**                          | **24**   |
