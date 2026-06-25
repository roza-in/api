import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);

  // Security Middleware
  app.use(helmet());

  // Enable Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // CORS Setup (whitelist origins from dashboard & websites)
  const allowedOriginsEnv = configService.get<string>('CORS_ALLOWED_ORIGINS');
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map((o) => o.trim())
    : [];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      const isAllowed = allowedOrigins.some((allowedOrigin) => {
        if (allowedOrigin === '*') return true;
        // Exact URL match (e.g. https://app.rozx.in === https://app.rozx.in)
        if (origin === allowedOrigin) return true;
        // Wildcard subdomain match: extract hostnames and check suffix
        // e.g. origin=https://kapilssalon.rozx.in, allowed=https://rozx.in
        // → originHost=kapilssalon.rozx.in ends with .rozx.in ✓
        try {
          const originHost = new URL(origin).hostname;
          const allowedHost = new URL(allowedOrigin).hostname;
          return (
            originHost === allowedHost ||
            originHost.endsWith('.' + allowedHost)
          );
        } catch {
          return false;
        }
      });

      if (isAllowed || configService.get('NODE_ENV') !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger API Docs
  const config = new DocumentBuilder()
    .setTitle('Rozx API Server')
    .setDescription('Backend API server powering Rozx SaaS platform platforms.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Rozx API is running on: http://localhost:${port}`);
  logger.log(`API documentation available at: http://localhost:${port}/docs`);
}
void bootstrap();
