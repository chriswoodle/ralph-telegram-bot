import path from 'path';
import fs from 'fs';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { OpenApiStudioModule } from '@openapi-studio/nestjs';
import { AppModule } from './app.module';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { pkg } from './utils/environment';
import { AppConfig } from './config';

async function bootstrap() {
    const logger = new Logger()
    logger.log(`Starting app version: ${pkg.version}`)

    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            trustProxy: true
        }),
        {
            logger,
        }
    );

    const configService = app.get(ConfigService<AppConfig>);

    app.enableCors({
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
    });

    const documentBuilder = new DocumentBuilder()
        .setTitle(`${configService.get('BOT_NAME', 'Ralph')} API`)
        .setDescription(`${configService.get('BOT_NAME', 'Ralph')} API Description`)
        .setVersion('1.0')

    const document = cleanupOpenApiDoc(
        SwaggerModule.createDocument(app, documentBuilder.build()),
        { version: "3.0" }
    );

    // Setup OpenAPI Studio
    OpenApiStudioModule.setup('/', app, document, {
        serviceHost: configService.get('SERVICE_HOST'),
    });

    if (configService.get('GENERATE_SPEC')) {
        logger.log('Generating OpenAPI Spec...');
        const output = path.resolve(__filename, '../../docs/');
        fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.resolve(output, 'api-json.json'), JSON.stringify(document));
        logger.log('Generating OpenAPI Spec complete.');
        app.close();
        return;
    }

    await app.init();
    await app.listen(configService.get('PORT'));
    logger.log(`App listening on port: ${configService.get('PORT')}`);
}
bootstrap();
