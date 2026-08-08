import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/domain-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.enableShutdownHooks();

  // whitelist + forbidNonWhitelisted: unknown fields are an error, not silently
  // dropped. See docs/api-conventions.md.
  app.useGlobalFilters(new DomainExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.get<boolean>('SWAGGER_ENABLED')) {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('artical-manager API')
        .setDescription('Admin and public content API. See /api for the Bruno collection.')
        .setVersion('1')
        .build(),
    );
    SwaggerModule.setup('docs', app, doc);
  }

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port, '0.0.0.0');

  new Logger('bootstrap').log(`API listening on :${port}`);
}

void bootstrap();
