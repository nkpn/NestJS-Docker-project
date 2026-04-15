import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { join } from 'path';

import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';

import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),

    // Logger (Pino)
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        redact: ['req.headers.authorization'],
      },
    }),

    // Prometheus metrics at GET /metrics
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
    }),

    // Database
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const databaseUrl = config.get<string>('database.url');
        const isProduction = config.get<string>('nodeEnv') === 'production';

        const base = {
          type: 'postgres' as const,
          entities: [join(__dirname, '**', '*.entity.{ts,js}')],
          // synchronize in dev/test; use migrations in production
          synchronize: !isProduction,
          logging: !isProduction,
        };

        if (databaseUrl) {
          // Neon / Render: single connection string with SSL required
          return {
            ...base,
            url: databaseUrl,
            ssl: { rejectUnauthorized: false },
          };
        }

        // Local Docker: individual connection params
        return {
          ...base,
          host: config.get<string>('database.host'),
          port: config.get<number>('database.port'),
          username: config.get<string>('database.username'),
          password: config.get<string>('database.password'),
          database: config.get<string>('database.database'),
        };
      },
    }),

    // GraphQL
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      sortSchema: true,
      playground: true,
      introspection: true,
      context: ({ req }: { req: Express.Request }) => ({ req }),
    }),

    // Feature modules
    RabbitmqModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    HealthModule,
  ],
})
export class AppModule {}
