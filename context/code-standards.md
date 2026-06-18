# Code Standards

Implementation rules and conventions for the Rozx API server. Every AI agent must follow these in every session without exception. These rules prevent pattern drift across sessions.

---

## Engineering Mindset

The AI agent on this project operates as a senior backend engineer. This means:

- **Think before implementing** — understand what is being built and why before writing a single line
- **Read context files first** — never assume, always verify against architecture.md and project-overview.md
- **Scope is sacred** — only build what the current feature requires. Never go beyond scope even if it seems helpful
- **Every feature must be testable** — if it cannot be verified immediately after implementation, it is incomplete
- **Clean over clever** — simple readable code that a junior developer can understand is always preferred over clever abstractions
- **One thing at a time** — complete one feature fully before touching the next
- **Failures are expected** — wrap operations in try/catch, log failures, never let one failure crash the server
- **Test business logic, not frameworks** — focus testing effort where business risk is highest

---

## TypeScript

- Strict mode must be enabled — `strictNullChecks: true` at minimum
- Never use `any` — use `unknown` and narrow the type
- Never use type assertions (`as SomeType`) unless absolutely necessary and commented why
- All function parameters and return types must be explicitly typed
- Use `interface` for class contracts and DTOs — use `type` for unions and utility types
- All async functions must have proper error handling — never let promises float unhandled
- Use `const` by default — only use `let` when reassignment is necessary
- Use NestJS decorators throughout — never bypass the framework

---

## NestJS 11 Conventions

- Every feature is a **Module** (`@Module`) with its own controller, service, entities, and DTOs
- Controllers handle HTTP concerns only — request parsing, response formatting, route parameters
- Services contain all business logic — controllers always delegate to services
- Use **Dependency Injection** everywhere — never instantiate services manually
- Use `@Injectable()` on every service
- Use DTOs with `class-validator` decorators for all request validation
- Use custom decorators for extracting user context (`@CurrentUser()`, `@CurrentBusiness()`)
- Use guards for auth, roles, and subscription checks — never check in controllers
- Use interceptors for response transformation and audit logging
- Global exception filters handle all unhandled errors with consistent error responses

---

## File and Folder Naming

- Folders: kebab-case — `website-builder`, `auth`
- Module files: kebab-case with suffix — `appointments.module.ts`, `appointments.controller.ts`, `appointments.service.ts`
- Entity files: kebab-case with `.entity.ts` suffix — `appointment.entity.ts`
- DTO files: kebab-case with `.dto.ts` suffix — `create-appointment.dto.ts`
- Guard files: kebab-case with `.guard.ts` suffix — `roles.guard.ts`
- Adapter files: kebab-case with `.service.ts` or `.adapter.ts` suffix
- One class per file — never export multiple classes from one file
- Test files: same name as source with `.spec.ts` suffix — `appointments.service.spec.ts`

---

## Module Structure

Every feature module follows this exact structure:

```
src/modules/feature-name/
├── feature-name.module.ts      → Module definition
├── feature-name.controller.ts  → HTTP routes
├── feature-name.service.ts     → Business logic
├── dto/
│   ├── create-feature.dto.ts   → Create request DTO
│   ├── update-feature.dto.ts   → Update request DTO
│   └── feature-response.dto.ts → Response DTO (optional)
└── feature-name.service.spec.ts → Unit tests
```

> **Note:** Prisma models defined in `prisma/schema.prisma` serve as the entity layer.
> There is no separate `entities/` folder per module unless needed for Swagger serialization classes.

---

## Controller Pattern

```typescript
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @Roles(Role.OWNER, Role.MANAGER, Role.RECEPTION)
  async create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(user.businessId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.MANAGER, Role.RECEPTION, Role.PROFESSIONAL)
  async findAll(
    @CurrentUser() user: UserPayload,
    @Query() query: PaginationDto,
  ) {
    return this.appointmentsService.findAll(user.businessId, query);
  }
}
```

- Every controller method has a role guard
- Every controller method extracts user context via `@CurrentUser()`
- Every controller method delegates to a service — no inline logic
- Every write operation validates input via DTO
- Never return raw database entities — use response DTOs or transform interceptors

---

```typescript
@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictService: ConflictService,
    private readonly notificationService: NotificationService,
  ) {}

  async create(businessId: string, userId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    // 1. Check for conflicts
    const conflict = await this.conflictService.check(businessId, dto);
    if (conflict) {
      throw new ConflictException('Time slot unavailable');
    }

    // 2. Create appointment with audit trail
    const saved = await this.prisma.appointment.create({
      data: {
        ...dto,
        businessId,
        status: AppointmentStatus.CONFIRMED,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    // 3. Queue notification
    await this.notificationService.queueAppointmentConfirmation(saved);

    return saved;
  }

  async update(
    businessId: string,
    userId: string,
    id: string,
    dto: UpdateAppointmentDto,
    expectedVersion: number,
  ): Promise<Appointment> {
    // Optimistic locking — version check
    const result = await this.prisma.appointment.updateMany({
      where: { id, businessId, version: expectedVersion },
      data: { ...dto, updatedBy: userId, version: { increment: 1 } },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Record was modified by another user. Please refresh and try again.',
      );
    }

    return this.prisma.appointment.findUniqueOrThrow({ where: { id } });
  }
}
```

- Every service method that operates on business data requires `businessId` as first parameter
- Every write operation includes `createdBy` / `updatedBy` for audit trail
- Every update uses optimistic locking via `version` field
- Every service method has a try/catch or throws typed exceptions
- Services use constructor injection — never use `@Inject()` for basic services
- Services never import from controllers or other modules' controllers
- Services may import other services from the same or dependency modules
- Soft-delete extension on PrismaService auto-filters `deletedAt: null` on reads — no manual filtering needed

---

## DTO Pattern

```typescript
import { IsString, IsNotEmpty, IsDateString, IsUUID, IsOptional } from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @IsUUID()
  @IsNotEmpty()
  staffId: string;

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
```

- Every DTO uses `class-validator` decorators
- Every field has at least `@IsNotEmpty()` or `@IsOptional()`
- Use specific validators: `@IsUUID()`, `@IsEmail()`, `@IsDateString()`, `@IsEnum()`
- Never use `any` in DTOs
- Create and Update DTOs are separate — Update uses `PartialType(CreateDto)`

---

## Error Handling

- Use NestJS built-in exceptions: `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`
- Never use empty catch blocks — always log or handle
- Log errors with context: `this.logger.error('Failed to create appointment', error.stack)`
- User-facing errors must be human readable — never expose raw error messages
- All unhandled errors caught by global exception filter
- API errors return consistent format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "details": [{ "field": "startTime", "message": "must be a valid date" }]
}
```

---

## Webhook Processing

```typescript
@Post('razorpay')
async handleRazorpay(@Req() req: RawBodyRequest<Request>) {
  // 1. Verify signature
  const isValid = this.razorpayService.verifySignature(
    req.rawBody,
    req.headers['x-razorpay-signature'],
  );
  if (!isValid) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  // 2. Check idempotency
  const eventId = req.body.event_id;
  const exists = await this.prisma.webhookEvent.findUnique({
    where: { providerEventId: eventId },
  });
  if (exists) {
    return { status: 'already_processed' };
  }

  // 3. Store event
  await this.prisma.webhookEvent.create({
    data: {
      provider: 'razorpay',
      eventType: req.body.event,
      providerEventId: eventId,
      payload: req.body as any,
      status: 'pending',
    },
  });

  // 4. Queue for async processing
  await this.webhookQueue.add('process-razorpay', { eventId });

  return { status: 'accepted' };
}
```

- Always verify provider signature first
- Always check idempotency before processing
- Always queue for async processing — never process webhooks synchronously
- Always store raw webhook payload for debugging

---

## Environment Variables

All environment variables loaded via `@nestjs/config`. Never hardcode any key, URL, or secret.

| Variable                 | Purpose                        |
|--------------------------|--------------------------------|
| `PORT`                   | Server port                    |
| `NODE_ENV`               | Environment (dev/staging/prod) |
| `DATABASE_URL`           | PostgreSQL connection string   |
| `REDIS_URL`              | Redis connection string        |
| `JWT_SECRET`             | JWT signing secret             |
| `JWT_EXPIRY`             | Access token expiry            |
| `JWT_REFRESH_EXPIRY`     | Refresh token expiry           |
| `RAZORPAY_KEY_ID`        | Razorpay API key               |
| `RAZORPAY_KEY_SECRET`    | Razorpay API secret            |
| `RAZORPAY_WEBHOOK_SECRET`| Razorpay webhook signature key |
| `WHATSAPP_API_URL`       | WhatsApp Business API URL      |
| `WHATSAPP_ACCESS_TOKEN`  | WhatsApp API token             |
| `MSG91_AUTH_KEY`          | MSG91 authentication key       |
| `MSG91_SENDER_ID`        | MSG91 sender ID                |
| `RESEND_API_KEY`         | Resend email API key           |
| `AWS_ACCESS_KEY_ID`      | AWS access key                 |
| `AWS_SECRET_ACCESS_KEY`  | AWS secret key                 |
| `AWS_S3_BUCKET`          | S3 bucket name                 |
| `AWS_REGION`             | AWS region (ap-south-1)        |
| `GOOGLE_CLIENT_ID`       | Google OAuth client ID         |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth client secret     |

---

## Logging

- Use NestJS built-in `Logger` — never use `console.log` in production code
- Every service creates its own logger: `private readonly logger = new Logger(AppointmentsService.name)`
- Log levels: `error` (failures), `warn` (degraded), `log` (important events), `debug` (development)
- Every external API call should log request and response at `debug` level
- Every error should log the full stack trace

---

## Audit Logging

Every mutation on business data must create an audit log entry:

| Field      | Value                                              |
|------------|----------------------------------------------------|
| businessId | Current business                                   |
| userId     | Current user                                       |
| action     | CREATE / UPDATE / DELETE                           |
| entity     | Appointment / Payment / Customer / etc.            |
| entityId   | ID of the affected record                          |
| metadata   | JSON with old and new values (for updates)         |
| createdAt  | Timestamp                                          |

AuditLog records are **immutable** — they have no soft delete, no version field, and are never updated or deleted.

---

## Testing Strategy

| Level       | Coverage | Technology      | Focus                                    |
|-------------|----------|-----------------|------------------------------------------|
| Unit        | 70%      | Jest            | Business logic, calculations, validators |
| Integration | 20%      | Jest + Supertest| API endpoints, DB operations, webhooks   |
| E2E         | 10%      | Playwright      | Complete user journeys                   |

### Critical Modules (90%+ coverage)
- Authentication, Authorization, Payments, Subscriptions
- Appointment conflict detection, Permission middleware, Webhook processing

### Mandatory 100% Coverage
- Payment calculations (refunds, net revenue, proration)
- Permission logic (RBAC, entitlements, tenant isolation)
- Appointment conflict detection (double booking prevention)
- Idempotency processing (payment retries, webhook retries)

### Test Commands
```bash
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run test:e2e          # E2E tests
npm run test:cov          # Coverage report
npm run validate          # Lint → Unit → Integration → Coverage → Build
```

### Important Modules (80%+ coverage)
- Customers, Services, Staff, Notifications
- Website Builder, Analytics Calculations

### Standard Modules (70%+ coverage)
- Dashboard data, Reports, Marketing, Settings

### Test Data Rules

- **Never use production data** in tests
- Use **factories** for generating test entities (BusinessFactory, AppointmentFactory, etc.)
- Use **seed scripts** for local development data
- Use **fixtures** for integration tests
- Test data must include:
  - Multiple businesses (tenant isolation verification)
  - Multiple staff per business
  - Multiple customers per business
  - Different timezones (Asia/Kolkata, UTC, America/New_York)
  - Different subscription plans (Free, Starter, Growth, Enterprise)
- Dedicated testing database — never share with development
- Dedicated Redis instance for tests
- Mock all external providers (Razorpay, WhatsApp, MSG91, Email)
- No external provider should be required for automated tests

### Bug Classification

| Severity | Definition | Examples |
|----------|------------|----------|
| P1 Critical | Revenue loss, security issue, data loss | Payment errors, double bookings, platform down, auth broken |
| P2 High | Core workflow broken | Online booking unavailable, notifications failing, reports broken |
| P3 Medium | Feature partially broken | Analytics bug, export issue, non-critical integration failure |
| P4 Low | Minor issues | Cosmetic problems, typos, enhancement requests |

### E2E Critical Paths (mandatory for every release)

1. **Business Onboarding:** Signup → Create Branch → Add Service → Add Staff → Create Appointment
2. **Customer Booking:** Customer Books Online → Appointment Created → Reminder Sent → Completed → Payment Recorded
3. **Subscription Upgrade:** Business Upgrades → Payment Success → Entitlements Updated → Features Unlocked
4. **Custom Domain:** Domain Added → DNS Verified → SSL Issued → Website Accessible
5. **Refund Processing:** Refund Created → Revenue Updated → Audit Log Created

### CI/CD Quality Gates

Pipeline fails if:
- Unit tests fail
- Integration tests fail
- E2E tests fail
- Linting fails
- TypeScript build fails
- Security scan fails
- Critical modules below 90% coverage
- Overall coverage below 80%

**No deployment if any gate fails.**

---

## Import Conventions

- Use NestJS dependency injection — never import services directly from other modules
- `PrismaModule` is `@Global()` — `PrismaService` is available everywhere without explicit import
- Import shared utilities from `src/common/`
- Import integration adapters from `src/integrations/`
- Never import from `test/` in source code

---

## Comments

- No comments explaining what the code does — code must be self-explanatory
- Comments only for why — explaining a non-obvious decision
- Business rules should have a brief comment referencing the spec document
- Never leave TODO comments in committed code — track in progress-tracker.md

---

## Dependencies

Never install a new package without a clear reason. Before installing anything check:

1. Does NestJS already provide this functionality?
2. Is there a simpler native solution?
3. Is the package actively maintained?

Approved dependencies for this project:

- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` — NestJS core
- `@nestjs/config` — Configuration management
- `@prisma/client` and `prisma` — Database ORM (client & CLI devDependency)
- `@nestjs/passport`, `passport-jwt`, `passport-google-oauth20` — Authentication
- `@nestjs/jwt` — JWT token management
- `@nestjs/bull` or `@nestjs/bullmq` — Job queue management
- `class-validator`, `class-transformer` — DTO validation
- `razorpay` — Razorpay SDK
- `ioredis` — Redis client
- `bcrypt` — Password hashing
- `uuid` — UUID generation
- `dayjs` or `date-fns` — Date manipulation
- `helmet` — Security headers
- `express-rate-limit` — Rate limiting
- `@nestjs/swagger` — API documentation

Do not install any other packages without updating this list first.
