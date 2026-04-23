import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GqlHttpExceptionFilter } from './common/filters/gql-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use Pino logger
  app.useLogger(app.get(Logger));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global GraphQL exception filter
  app.useGlobalFilters(new GqlHttpExceptionFilter());

  // CORS for external access
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application running on: http://localhost:${port}/graphql`);
  console.log(`Health check: http://localhost:${port}/health`);
  console.log(`Metrics: http://localhost:${port}/metrics`);
}

void bootstrap();
