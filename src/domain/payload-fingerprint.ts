import type { Request } from '../domain/request-validation.js';
import { createHash } from 'node:crypto';

export function fingerprint(request: Request): string {
    const canonical = {
        test: request.test,
        service: request.service,
        customer: {
            name: request.customer.name,
            email: request.customer.email,
            phone: request.customer.phone,
        },
        preferred_at: request.preferred_at,
    };
    const json = JSON.stringify(canonical);
    return createHash('sha256').update(json).digest('hex');
}