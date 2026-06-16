# Project Overview

## About the Project

Rozx is a multi-tenant SaaS platform for service businesses (salons, spas, beauty studios, wellness centers). This repository (`api/`) is the **backend API server** built with NestJS 11. It serves as the single backend powering all Rozx client platforms — web dashboard, mobile apps, booking websites, and third-party integrations.

The server handles:
- Multi-tenant business management (branches, staff, services)
- Appointment scheduling with conflict detection and availability engine
- Customer relationship management (CRM)
- Payment processing via Razorpay (business payments + Rozx subscriptions)
- Subscription & entitlement management (tiered plans with feature gating)
- Role-based access control (RBAC) with business-scoped permissions
- Website builder backend (pages, themes, domains, publishing)
- Notification orchestration (WhatsApp, SMS, Email, In-App)
- Analytics & reporting engine
- Marketing campaigns (WhatsApp campaigns, birthday/win-back automation)

---

## The Problem It Solves

Service business owners in India (primarily salons) currently manage appointments via WhatsApp, phone calls, and notebooks. They lack:
- Online booking capability
- Customer history tracking
- Revenue visibility
- Automated reminders (reducing no-shows)
- Professional web presence

Rozx replaces all of this with a single platform that handles appointments, customers, payments, notifications, a booking website, and business analytics — all from one system.

---

## Target Customer

**Primary ICP:** Owner-operated salons with 2–10 staff, 1–2 branches, monthly revenue ₹2L–₹20L, active on Instagram, using UPI and WhatsApp daily.

**Geographic Focus (Phase 1):** One city in India (e.g., Delhi NCR, Lucknow, Kanpur).

---

## Business Model

Rozx operates a **tiered subscription model** with Razorpay for payment processing:

| Plan       | Target                    |
|------------|---------------------------|
| Free/Trial | Onboarding, 90-day pilot  |
| Starter    | Single branch, basic CRM  |
| Growth     | Multi-branch, analytics   |
| Enterprise | Custom, white-label       |

Revenue comes from monthly/annual subscriptions. Customer-to-business payments flow through Razorpay — Rozx is **not** the merchant of record.

---

## Core Modules

| Module           | Priority  | Purpose                                         |
|------------------|-----------|--------------------------------------------------|
| Auth             | Critical  | Login, OAuth, JWT, refresh tokens, sessions       |
| Business         | Critical  | Business registration, branches, settings         |
| Staff            | Critical  | Staff management, schedules, roles                |
| Services         | Critical  | Service catalog, pricing, duration, categories    |
| Appointments     | Critical  | Scheduling, conflict detection, availability      |
| Customers        | Critical  | CRM, customer profiles, visit history             |
| Payments         | Critical  | Razorpay integration, invoices, refunds, receipts |
| Subscriptions    | Critical  | Plans, billing, entitlements, feature gates        |
| Permissions      | Critical  | RBAC, tenant isolation, middleware                 |
| Webhooks         | Critical  | Razorpay, WhatsApp, MSG91 webhook processing      |
| Notifications    | High      | WhatsApp, SMS, Email, In-App message orchestration |
| Website Builder  | High      | Pages, themes, domains, publishing, SEO            |
| Analytics        | High      | Revenue, appointment, customer, staff metrics      |
| Marketing        | Medium    | Campaigns, templates, consent, delivery tracking   |
| Reports/Exports  | Medium    | CSV, Excel, PDF export with audit logging          |
| Admin            | Medium    | Rozx internal admin — MRR, ARR, churn, health      |

---

## Client Platforms Served

This API serves all Rozx client platforms:

| Platform         | Tech              | Purpose                          |
|------------------|-------------------|----------------------------------|
| Web Dashboard    | Next.js           | Business management interface     |
| Mobile App       | React Native      | Owner/staff mobile access         |
| Booking Website  | Next.js (SSR/SSG) | Customer-facing booking site      |
| Rozx Admin       | Internal web      | Platform administration           |

---

## Key Third-Party Integrations

| Provider           | Purpose                        | Priority |
|--------------------|--------------------------------|----------|
| Razorpay           | Payments, subscriptions        | Critical |
| WhatsApp Business  | Notifications, marketing       | Critical |
| MSG91              | SMS OTP, reminder fallback     | High     |
| Google OAuth       | Business login                 | Medium   |
| Resend             | Transactional email            | Medium   |
| AWS S3 + CloudFront| Media storage, CDN             | High     |
| Let's Encrypt      | SSL for custom domains         | High     |
| Redis              | Caching, queues, rate limiting | Critical |
| BullMQ             | Job queues, background tasks   | Critical |

---

## Features Explicitly Deferred

- AI Marketing / AI Insights / AI Recommendations (post product-market fit)
- Blog Builder
- Multi-language websites
- Custom HTML/CSS/JS in website builder
- Ecommerce store / marketplace
- Forecasting, cohort analysis, funnel analysis (post 100 customers)
- Multi-currency support

---

## Success Criteria

- Business can sign up, create branch, add services/staff, and take first appointment in under 15 minutes
- Online booking works end-to-end: customer books → appointment created → reminder sent → payment recorded
- Zero double bookings — appointment conflict detection is bulletproof
- Payment processing is reliable with webhook-verified confirmation only
- 99.9% API uptime
- P1 incident MTTR under 4 hours

---

## Founder Rules

- Test business logic, not frameworks
- Every payment flow must be tested
- Every appointment conflict scenario must be tested
- Customer data belongs to the customer
- The website exists to generate bookings
- Sell outcomes, not features
- A failed test is cheaper than a lost customer
- The cost of an integration is not building it — the cost is maintaining it for years
