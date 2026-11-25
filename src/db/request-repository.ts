import Database  from "better-sqlite3";
import type { Request } from "../domain/request-validation.js";
import { randomUUID } from "node:crypto";
import { fingerprint } from "../domain/payload-fingerprint.js";
type RegistrationResult = 
| { kind:"created"; request_id: string }
| { kind:"replayed"; request_id: string }
| { kind:"conflict" };
export function registerRequest(
    db: Database.Database,
    request: Request
): RegistrationResult {
    const transaction = db.transaction((request: Request): RegistrationResult => {
        const hash = fingerprint(request);
        const existing = db
            .prepare("SELECT * FROM requests WHERE idempotency_key = ?")
            .get(request.idempotency_key) as { request_id: string; payload_hash: string } | undefined;
        if (existing) {
            if (existing.payload_hash === hash) {
                return { kind: "replayed", request_id: existing.request_id };
            }
            return { kind: "conflict" };
        } else {
            const request_id = randomUUID();

            db.prepare(
                "INSERT INTO requests (idempotency_key, request_id, payload_hash, service, preferred_at,created_at) VALUES (?, ?, ?, ?, ?, ?)"
            ).run(request.idempotency_key, request_id, hash, request.service, request.preferred_at, new Date().toISOString());
            return { kind: "created", request_id: request_id };
        }
    })
    return transaction.immediate(request);
}