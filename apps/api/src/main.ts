import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: config().NODE_ENV === 'test' ? ['error'] : ['error', 'warn', 'log'] });
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}

if (require.main === module) {
  createApp()
    .then(async (app) => {
      await app.listen(config().PORT);
      new Logger('Space').log(`API listening on :${config().PORT}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
