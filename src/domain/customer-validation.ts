import {z} from 'zod';

export const customerSchema = z.object({
    name: z.string().min(1, { message: "Name is invalid" }),
    email: z.email({ message: "Invalid email address" }),
    phone: z.string().min(1, { message: "Phone number is invalid" }),
});

export type Customer = z.infer<typeof customerSchema>;