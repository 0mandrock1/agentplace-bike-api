import Database from 'better-sqlite3';
export function initializeSchema(db: Database.Database): void {
    db.exec(`
        CREATE TABLE IF NOT EXISTS requests (
            idempotency_key TEXT PRIMARY KEY NOT NULL,
            request_id TEXT NOT NULL,
            payload_hash TEXT NOT NULL,
            service TEXT NOT NULL,
            preferred_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            
        )
    `);
}