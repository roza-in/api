import { registerAs } from '@nestjs/config';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  tls: boolean;
}

export default registerAs('redis', (): RedisConfig => {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');

  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    db: Number(url.pathname?.slice(1)) || 0,
    tls: url.protocol === 'rediss:',
  };
});
