export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  database: {
    // DATABASE_URL takes priority (Neon / Render).
    // Falls back to individual DB_* vars (local Docker).
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL,
  },
});
