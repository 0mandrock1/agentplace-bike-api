import {z} from 'zod';
import { customerSchema } from './customer-validation.js';
import { servicesSchema } from './service-validation.js';
export const requestSchema = z.object({
    test: z.literal(true),
    service: servicesSchema,
    customer: customerSchema,
    idempotency_key: z.uuid(),
    preferred_at: z.iso.datetime({ offset: true }),
});

export type Request = z.infer<typeof requestSchema>;