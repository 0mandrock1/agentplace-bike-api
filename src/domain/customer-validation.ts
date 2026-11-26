import {z} from 'zod';

const syntheticEmail = /@(?:example\.(?:com|net|org)|[a-z0-9.-]+\.test)$/i;
// NANPA reserves 555-0100 through 555-0199 for fictitious use.
const syntheticPhone = /^\+120255501[0-9]{2}$/;

export const customerSchema = z.object({
    name: z.string().trim().min(1, { message: "Name is invalid" }).max(120),
    email: z.email({ message: "Invalid email address" }).max(254).regex(syntheticEmail, { message: "Use a synthetic email address" }),
    phone: z.string().regex(syntheticPhone, { message: "Use a synthetic phone number (+12025550100 to +12025550199)" }),
});

export type Customer = z.infer<typeof customerSchema>;
