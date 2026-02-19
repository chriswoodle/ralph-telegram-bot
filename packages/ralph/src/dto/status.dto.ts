import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const StatusResponseSchema = z.object({
    version: z.string(),
    build_id: z.string()
});

export class StatusResponseDto extends createZodDto(StatusResponseSchema) { } 