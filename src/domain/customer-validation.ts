import {z} from 'zod';

export const customerSchema = z.object({
    name: z.string(),
    email: z.email(),
    phone: z.string(),
});

export type Customer = z.infer<typeof customerSchema>;