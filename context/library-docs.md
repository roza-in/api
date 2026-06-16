# Library Docs

Project-specific usage patterns for every third-party library in the Rozx API server. This file only covers how we use each library in this specific project — rules, patterns, and constraints specific to Rozx.

Read the relevant section before implementing any feature that touches these libraries.

---

## Before Using Any Library

Before implementing any feature that uses a third-party library:

1. **Check AGENTS.md** at the project root — it lists every skill installed for this project
2. **Check if an MCP server is configured** for that library
3. **Read this file** for project-specific patterns

The order of authority is:

```
MCP server (real-time docs) → Skills via AGENTS.md → This file (project rules) → General training knowledge
```

Never rely on general training knowledge alone for library APIs — they change frequently.

---

## NestJS 11

### Module Registration

```typescript
// Feature module
@Module({
  imports: [
    PrismaModule, // Optional if PrismaModule is global, but good practice
    BullModule.registerQueue({ name: 'notifications' }),
    NotificationsModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, ConflictService, AvailabilityService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
```

### Global Config Module

```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    // ... feature modules
  ],
})
export class AppModule {}
```

**Rules:**

- ConfigModule is always global — no need to import in feature modules
- PrismaModule is marked `@Global()` so PrismaService is available everywhere without re-importing
- Every feature module exports its primary service for cross-module use

---

## Prisma

### Schema Definition (prisma/schema.prisma)

```prisma
model Appointment {
  id          String            @id @default(uuid()) @db.Uuid
  businessId  String            @db.Uuid
  branchId    String            @db.Uuid
  staffId     String            @db.Uuid
  customerId  String            @db.Uuid
  serviceId   String            @db.Uuid
  status      AppointmentStatus @default(CONFIRMED)
  startTime   DateTime          @db.Timestamptz
  endTime     DateTime          @db.Timestamptz
  notes       String?           @db.Text
  createdAt   DateTime          @default(now()) @db.Timestamptz
  updatedAt   DateTime          @updatedAt @db.Timestamptz
  deletedAt   DateTime?         @db.Timestamptz

  staff       Staff             @relation(fields: [staffId], references: [id])
  customer    Customer          @relation(fields: [customerId], references: [id])

  @@index([businessId])
  @@map("appointments")
}
```

**Rules:**

- Always use `@@index([businessId])` on every tenant-scoped model — every query filters by it
- Always use `uuid()` for primary keys — never auto-increment integers
- Use `@db.Timestamptz` for all date columns — timezone-aware
- Soft deletes via nullable `deletedAt` column — never hard delete business data
- Immutable records (Payment, Refund, Invoice, AuditLog, WebhookEvent) have no `deletedAt`/`version` fields
- Every mutable entity has `version Int @default(1)` for optimistic locking
- Every mutable entity has `createdBy` and `updatedBy` UUID fields for audit trail
- Every model should map to lowercase plural table names using `@@map("table_name")`

---

### Prisma Queries

```typescript
// Soft-delete extension auto-appends `deletedAt: null` on reads.
// No manual filtering needed.
const appointments = await this.prisma.appointment.findMany({
  where: {
    businessId,
    status: 'CONFIRMED',
    startTime: {
      gte: startOfDay,
      lte: endOfDay,
    },
  },
  include: {
    staff: true,
    customer: true,
  },
  orderBy: {
    startTime: 'asc',
  },
});

// Pagination using transaction (consistent counting)
const [items, total] = await this.prisma.$transaction([
  this.prisma.appointment.findMany({
    where: { businessId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  }),
  this.prisma.appointment.count({
    where: { businessId },
  }),
]);

// Optimistic locking on update
const result = await this.prisma.appointment.updateMany({
  where: { id, businessId, version: expectedVersion },
  data: { ...dto, updatedBy: userId, version: { increment: 1 } },
});
if (result.count === 0) {
  throw new ConflictException('Record was modified by another user');
}

// Soft delete (set deletedAt instead of actual delete)
await this.prisma.appointment.update({
  where: { id },
  data: { deletedAt: new Date(), updatedBy: userId },
});
```

**Rules:**

- Always include `businessId` in every query's `where` clause
- Soft-delete filtering is automatic via Prisma extension — no manual `deletedAt: null` needed
- Use `$transaction` for paginated queries to keep page items and count consistent
- Explicitly use `include` or `select` for relations — Prisma does not eager-load relations by default
- Always use optimistic locking (`version`) on updates — never blindly overwrite

---

## Razorpay SDK

### Initialization

```typescript
import Razorpay from 'razorpay';

@Injectable()
export class RazorpayService {
  private readonly razorpay: Razorpay;

  constructor(private readonly config: ConfigService) {
    this.razorpay = new Razorpay({
      key_id: this.config.get('RAZORPAY_KEY_ID'),
      key_secret: this.config.get('RAZORPAY_KEY_SECRET'),
    });
  }
}
```

### Create Payment Link

```typescript
async createPaymentLink(params: {
  amount: number; // in paise (₹100 = 10000)
  currency: string;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: Record<string, string>;
}) {
  return this.razorpay.paymentLink.create({
    amount: params.amount,
    currency: params.currency || 'INR',
    description: params.description,
    customer: {
      name: params.customerName,
      contact: params.customerPhone,
      email: params.customerEmail,
    },
    notify: { sms: true, email: !!params.customerEmail },
    notes: params.notes || {},
  });
}
```

### Webhook Signature Verification

```typescript
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';

verifySignature(body: string, signature: string): boolean {
  return validateWebhookSignature(
    body,
    signature,
    this.config.get('RAZORPAY_WEBHOOK_SECRET'),
  );
}
```

**Events Consumed:**

| Event                     | Action                                    |
|---------------------------|-------------------------------------------|
| `payment.authorized`      | Log, await capture                        |
| `payment.captured`        | Mark payment successful, generate receipt |
| `payment.failed`          | Mark payment failed, notify business      |
| `refund.processed`        | Create refund record, adjust net revenue  |
| `refund.failed`           | Log, alert admin                          |
| `subscription.charged`    | Renew subscription, update entitlements   |
| `subscription.cancelled`  | Start grace period, schedule downgrade    |

**Rules:**

- Amount is always in **paise** (₹100 = 10000) — never rupees
- Currency is always `'INR'` unless explicitly specified
- Never trust client-side payment success — only trust webhook events
- All webhook processing must be idempotent — store `event_id`
- Webhooks may arrive out of order — handle gracefully
- Webhooks may arrive multiple times — deduplicate via `provider_event_id`
- Always reconcile against Razorpay API if in doubt

---

## BullMQ

### Queue Setup

```typescript
// In module
BullModule.registerQueue(
  { name: 'notifications' },
  { name: 'webhooks' },
  { name: 'reports' },
)
```

### Job Producer

```typescript
@Injectable()
export class NotificationService {
  constructor(
    @InjectQueue('notifications')
    private readonly notificationQueue: Queue,
  ) {}

  async queueAppointmentConfirmation(appointment: Appointment) {
    await this.notificationQueue.add(
      'appointment-confirmation',
      {
        appointmentId: appointment.id,
        businessId: appointment.businessId,
        customerId: appointment.customerId,
      },
      {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 60000, // 1 minute initial delay
        },
        removeOnComplete: 100,
        removeOnFail: false, // keep failed jobs for review
      },
    );
  }
}
```

### Job Consumer (Worker)

```typescript
@Processor('notifications')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  @Process('appointment-confirmation')
  async handleConfirmation(job: Job) {
    try {
      const { appointmentId, businessId, customerId } = job.data;
      // 1. Load appointment, business, customer
      // 2. Select channel (WhatsApp → SMS fallback)
      // 3. Send notification via adapter
      // 4. Log communication record
    } catch (error) {
      this.logger.error(`Failed to send confirmation for appointment ${job.data.appointmentId}`, error.stack);
      throw error; // BullMQ will retry
    }
  }
}
```

### Retry Strategy

| Attempt | Delay    |
|---------|----------|
| 1       | Immediate|
| 2       | 1 minute |
| 3       | 5 minutes|
| 4       | 15 minutes|
| 5       | 1 hour   |
| Failure | Dead Letter Queue → Manual Review |

**Rules:**

- Always use `removeOnFail: false` — keep failed jobs for debugging
- Always use exponential backoff — never fixed delay
- Always log job failures with full context
- Queue names must be descriptive: `notifications`, `webhooks`, `reports`, `domain-verification`
- Never process webhooks synchronously — always queue

---

## WhatsApp Business API

### Adapter Pattern

```typescript
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(private readonly config: ConfigService, private readonly httpService: HttpService) {}

  async sendTemplate(params: {
    to: string;          // Phone number with country code
    templateName: string;
    language: string;    // 'en' or 'hi'
    components: TemplateComponent[];
  }): Promise<WhatsAppResponse> {
    try {
      const response = await this.httpService.axiosRef.post(
        `${this.config.get('WHATSAPP_API_URL')}/messages`,
        {
          messaging_product: 'whatsapp',
          to: params.to,
          type: 'template',
          template: {
            name: params.templateName,
            language: { code: params.language },
            components: params.components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.get('WHATSAPP_ACCESS_TOKEN')}`,
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(`WhatsApp send failed for ${params.to}`, error.stack);
      throw error;
    }
  }
}
```

**Events Consumed (via webhook):**

| Event              | Action               |
|--------------------|----------------------|
| `message.sent`     | Update delivery status |
| `message.delivered`| Update delivery status |
| `message.read`     | Update read status     |
| `message.failed`   | Log failure, retry     |

**Rules:**

- Template approval required before sending — never send unapproved templates
- Marketing and utility templates differ — respect category pricing
- Always include country code in phone numbers
- Rate limit: max 5 transactional messages/day per customer, max 2 marketing/day
- Opt-out must be honored immediately — check consent before marketing messages

---

## MSG91

### SMS Sending

```typescript
@Injectable()
export class Msg91Service {
  async sendOtp(phone: string): Promise<Msg91Response> {
    const response = await this.httpService.axiosRef.post(
      'https://control.msg91.com/api/v5/otp',
      {
        template_id: this.config.get('MSG91_OTP_TEMPLATE_ID'),
        mobile: phone,
        authkey: this.config.get('MSG91_AUTH_KEY'),
      },
    );
    return response.data;
  }
}
```

**Rules:**

- TRAI DLT registration is mandatory — unregistered templates are blocked
- Template IDs required for every message
- Sender IDs require approval
- SMS is backup channel — prefer WhatsApp for cost efficiency

---

## Resend (Email)

### Email Sending

```typescript
@Injectable()
export class EmailService {
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
  }

  async sendTransactional(params: {
    to: string;
    subject: string;
    html: string;
  }) {
    return this.resend.emails.send({
      from: 'Rozx <noreply@rozx.in>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
  }
}
```

**Fallback:** AWS SES if Resend is unavailable.

**Rules:**

- Domain verification required (SPF/DKIM)
- Used for: subscription invoices, trial reminders, reports, security alerts
- Never use email for OTP — use SMS
- Monitor spam reputation

---

## AWS S3 (Storage)

### File Upload

```typescript
@Injectable()
export class StorageService {
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client({
      region: this.config.get('AWS_REGION'),
      credentials: {
        accessKeyId: this.config.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async upload(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<string> {
    await this.s3.send(new PutObjectCommand({
      Bucket: this.config.get('AWS_S3_BUCKET'),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }));
    return `https://${this.config.get('AWS_S3_BUCKET')}.s3.${this.config.get('AWS_REGION')}.amazonaws.com/${params.key}`;
  }
}
```

**Storage paths:**

| Content         | Path                                    |
|------------------|-----------------------------------------|
| Business logo    | `businesses/{businessId}/logo.{ext}`    |
| Staff photo      | `staff/{staffId}/photo.{ext}`           |
| Website media    | `websites/{websiteId}/media/{filename}` |
| Export files      | `exports/{businessId}/{filename}`       |

**Rules:**

- Maximum upload size: 10MB
- Supported image formats: jpg, png, webp
- All production data stored in AWS Mumbai Region (ap-south-1)
- Never write files to disk — always stream to S3

---

## Redis (ioredis)

### Usage Patterns

```typescript
// Caching
await redis.set(`business:${businessId}:settings`, JSON.stringify(settings), 'EX', 3600);
const cached = await redis.get(`business:${businessId}:settings`);

// Rate limiting
const key = `ratelimit:${ip}:${endpoint}`;
const count = await redis.incr(key);
if (count === 1) await redis.expire(key, 60);
if (count > 100) throw new TooManyRequestsException();

// Idempotency
const key = `webhook:${providerId}:${eventId}`;
const wasSet = await redis.set(key, '1', 'EX', 86400, 'NX');
if (!wasSet) return; // already processed
```

**Rules:**

- Cache expiry always set — never cache indefinitely
- Rate limit keys always expire — prevent memory leaks
- Use `NX` flag for idempotency checks — atomic set-if-not-exists
- Never cache appointment availability — always calculate fresh
- Cache business settings for 1 hour max
- Use separate Redis instance for testing

---

## Passport (JWT)

### JWT Strategy

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      email: payload.email,
      businessId: payload.businessId,
      branchId: payload.branchId,
      role: payload.role,
    };
  }
}
```

### JWT Payload Shape

```typescript
interface JwtPayload {
  sub: string;          // userId
  email: string;
  businessId: string;   // active business context
  memberId: string;     // BusinessMember ID
  branchId?: string;
  roleId: string;       // Role ID (resolved to permissions server-side)
  iat: number;
  exp: number;
}
```

**Rules:**

- Access token: 15 minute expiry
- Refresh token: 7 day expiry
- Refresh token rotation — old token invalidated on refresh
- Never store sensitive data in JWT payload
- Always extract user context via `@CurrentUser()` decorator — never parse JWT manually
- JWT includes `memberId` — used to resolve permissions and staff linkage

---

## class-validator

### Custom Validators

```typescript
// Indian phone number
@Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
phone: string;

// Business slug
@Matches(/^[a-z0-9-]+$/, { message: 'Slug must be lowercase alphanumeric with hyphens' })
slug: string;

// Currency amount (paise)
@IsInt()
@Min(100) // minimum ₹1
amount: number;
```

**Rules:**

- Always validate at the DTO level — never in services
- Phone numbers must match Indian format
- Amount always in paise — validate as integer
- Use `@Transform()` for data transformation before validation
