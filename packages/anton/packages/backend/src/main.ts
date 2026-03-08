import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors();

  const config = new DocumentBuilder()
    .setTitle('Anton API')
    .setDescription('Anton orchestration tool API')
    .setVersion('0.1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  if (process.env.GENERATE_OPENAPI) {
    const outputPath = path.resolve(__dirname, '..', 'openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
    console.log(`OpenAPI spec written to ${outputPath}`);
    await app.close();
    return;
  }

  SwaggerModule.setup('api/docs', app, () => document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Anton backend running on port ${port}`);
}

bootstrap();
