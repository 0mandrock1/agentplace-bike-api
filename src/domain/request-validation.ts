import {z} from 'zod';
import { customerSchema } from './customer-validation.js';
import { servicesSchema } from './service-validation.js';
export const requestSchema = z.object({
    test: z.literal(true),
    service: servicesSchema,
    customer: customerSchema,
});

export type Request = z.infer<typeof requestSchema>;