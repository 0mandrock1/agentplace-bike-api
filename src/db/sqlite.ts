import Database from 'better-sqlite3';

export function openDatabase(filename: string): Database.Database {
    return new Database(filename);
}