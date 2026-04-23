import { existsSync } from 'fs';
import { join } from 'path';

export function resolveEnvFilePath(
  nodeEnv: string = process.env.NODE_ENV ?? 'development',
): string {
  const envSpecific = join(process.cwd(), `.env.${nodeEnv}`);
  if (existsSync(envSpecific)) {
    return envSpecific;
  }

  return join(process.cwd(), '.env');
}
