import { servicesSchema } from './domain/service-validation.js';
import { test } from 'node:test';
import assert from "node:assert/strict";
import type { Service } from './domain/services.js';
import { customerSchema } from './domain/customer-validation.js';
import { requestSchema } from './domain/request-validation.js';
import type { Request } from './domain/request-validation.js';
import { openDatabase } from './db/sqlite.js';
import { initializeSchema } from './db/schema.js';
import { registerRequest } from './db/request-repository.js';
import { fingerprint } from './domain/payload-fingerprint.js';
import { z } from 'zod';


test('Test invalid service', () => {
  let result = servicesSchema.safeParse('invalid-service');
  assert.equal(result.success, false);
})

test("Test valid service", () => {
  const result = servicesSchema.safeParse('diagnostics');
  assert.ok(result.success);
  const service: Service = result.data;
});

test("Test invalid type: integer", () => {
  const result = servicesSchema.safeParse(42);
  assert.equal(result.success, false);
});

test("Test invalid type: null", () => {
  const result = servicesSchema.safeParse(null);
  assert.equal(result.success, false);
});

test("Test Customer schema with valid data", () => {
  const validCustomer = {
    name: "John Doe",
    email: "test@email.com",
    phone: "123-456-7890"
  };
  assert.doesNotThrow(() => {
    const result = customerSchema.parse(validCustomer);
    assert.ok(result);
  });
});

test("Test Customer schema without email", () => {
  const invalidCustomer = {
    name: "John Doe",
    phone: "123-456-7890"
  };
  assert.throws(() => {
    customerSchema.parse(invalidCustomer);
  });
});

test("Test Customer Schema with empty name", () => {
  const invalidCustomer = {
    name: "",
    email: "test@email.com",
    phone: "123-456-7890"
  };
  assert.throws(() => {
    customerSchema.parse(invalidCustomer);
  });
});
test("Test Customer Schema with empty phone", () => {
  const invalidCustomer = {
    name: "John Doe",
    email: "test@email.com",
    phone: ""
  };
  assert.throws(() => {
    customerSchema.parse(invalidCustomer);
  });
});


test("Test requestSchema with valid data", () => {
  const validRequest = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@email.com",
      phone: "123-456-7890"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
  assert.doesNotThrow(() => {
    requestSchema.parse(validRequest);
  });
});

test("Test requestSchema with invalid test value", () => {
  const invalidRequest = {
    test: false,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@email.com",
      phone: "123-456-7890"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
  assert.throws(() => {
    requestSchema.parse(invalidRequest);
  });
});

test("Test requestSchema with invalid uuid value", () => {
  const invalidRequest = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@email.com",
      phone: "123-456-7890"
    },
    idempotency_key: "invalid-uuid",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
  assert.throws(() => {
    requestSchema.parse(invalidRequest);
  });
});
test("Test requestSchema with invalid time value", () => {
  const invalidRequest = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@email.com",
      phone: "123-456-7890"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "invalid-time"
  };
  assert.throws(() => {
    requestSchema.parse(invalidRequest);
  });
});
test("Test requestSchema with invalid time format", () => {
  const invalidRequest = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@email.com",
      phone: "123-456-7890"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00"
  };
  assert.throws(() => {
    requestSchema.parse(invalidRequest);
  });
});

test("Opens database connection and SELECT 1 AS answer", () => {
  const db = openDatabase(':memory:');
  try {
    const row = db.prepare('SELECT 1 AS answer').get();
    assert.deepEqual(row, { answer: 1 });
  } finally {
    db.close();
  }
});

test("Opens database connection and creates requests table with duplicate idempotency_key check", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);
    const insert = db.prepare('INSERT INTO requests (idempotency_key, request_id, payload_hash, service, preferred_at) VALUES (?, ?, ?, ?, ?)');
    const values = ['1a1502ac-e045-4e8a-b900-4686b050a1cb', 'req-123', 'hash-abc', 'diagnostics', '2026-12-01T14:00:00+02:00'];
    insert.run(values);
    assert.throws(() => {
      insert.run(values);
    }, {code: 'SQLITE_CONSTRAINT_PRIMARYKEY'});
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();

    assert.deepEqual(row, { count: 1 });

  } finally {
    db.close();
  }
});

test("Opens database connection and creates requests table with NULL idempotency_key check", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);
    const insert = db.prepare('INSERT INTO requests (idempotency_key, request_id, payload_hash, service, preferred_at) VALUES (?, ?, ?, ?, ?)');
    const values = [null, 'req-123', 'hash-abc', 'diagnostics', '2026-12-01T14:00:00+02:00'];
    assert.throws(() => {
      insert.run(values);
    }, {code: 'SQLITE_CONSTRAINT_NOTNULL'});
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();

    assert.deepEqual(row, { count: 0 });

  } finally {
    db.close();
  }
});

test("Opens database connection and creates request using registerRequest function", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);

    const request = requestSchema.parse({
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "123-456-7890"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    });
    const result = registerRequest(db, request);
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();

    assert.deepEqual(row, { count: 1 });

    assert.ok(result.kind === "created");

    assert.ok(z.uuid().parse(result.request_id));
  } catch (err) {
    assert.fail(`registerRequest threw an error: ${err}`);
  } finally {
    db.close();
  }
});

test("Opens database connection and creates request using registerRequest function with replayed request", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);
    const request = requestSchema.parse({
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "123-456-7890"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    });
    const result1 = registerRequest(db, request);
    const result2 = registerRequest(db, request);
    assert.ok(result1.kind === "created");
    assert.ok(result2.kind === "replayed");
    assert.equal(result1.request_id, result2.request_id);
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();

    assert.deepEqual(row, { count: 1 });

  } catch (err) {
    assert.fail(`registerRequest threw an error: ${err}`);
  } finally {
    db.close();
  }
});

test("Opens database connection and creates request using registerRequest function with conflict request", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);
    const request1 = requestSchema.parse({
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "123-456-7890"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    });
    const request2 = requestSchema.parse({
      ...request1,
      service: "brake_adjustment"
    });
    const result1 = registerRequest(db, request1);
    const result2 = registerRequest(db, request2);
    assert.ok(result1.kind === "created");
    assert.ok(result2.kind === "conflict");
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();

    assert.deepEqual(row, { count: 1 });

    assert.deepEqual(db.prepare('SELECT service FROM requests WHERE idempotency_key = ?').get(request1.idempotency_key), { service: request1.service });


  } catch (err) {
    assert.fail(`registerRequest threw an error: ${err}`);
  } finally {
    db.close();
  }
});

test("Opens database connection and creates request using registerRequest function with different idempotency keys", () => {
  const db = openDatabase(':memory:');
  try {
    initializeSchema(db);
    const request1 = requestSchema.parse({
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "123-456-7890"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    });
    const request2 = requestSchema.parse({
      ...request1,
      idempotency_key: "2b2502ac-e045-4e8a-b900-4686b050a1cb"
    });
    const result1 = registerRequest(db, request1);
    const result2 = registerRequest(db, request2);
    assert.ok(result1.kind === "created");
    assert.ok(result2.kind === "created");
    assert.notEqual(result1.request_id, result2.request_id);
    const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
    ).get();
    assert.deepEqual(row, { count: 2 });
    const payload1 = db.prepare('SELECT payload_hash FROM requests WHERE idempotency_key = ?').get(request1.idempotency_key);
    const payload2 = db.prepare('SELECT payload_hash FROM requests WHERE idempotency_key = ?').get(request2.idempotency_key);
    if (!payload1 || !payload2) {
      assert.fail("Failed to retrieve payload hashes from the database.");
    } else {
      assert.deepEqual(payload1, payload2);
    }
  } catch (err) {
    assert.fail(`registerRequest threw an error: ${err}`);
  } finally {
    db.close();
  }
});

test("Tests fingerprint function with different payloads", () => {  
  const request1 : Request = requestSchema.parse({
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@example.com",
      phone: "123-456-7890"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  });
  const request2 : Request =  {
    service: "diagnostics",
    test: true,
    preferred_at: "2026-12-01T14:00:00+02:00",
    customer: {
      phone: "123-456-7890",
      name: "John Doe",
      email: "test@example.com"
    },
    idempotency_key: "2b2502ac-e045-4e8a-b900-4686b050a1cb"
  };
  
  assert.equal(fingerprint(request1), fingerprint(request1));
  assert.equal(fingerprint(request1), fingerprint(request2));
  assert.equal(fingerprint(request1), fingerprint({...request1,idempotency_key: "2b2502ac-e045-4e8a-b900-4686b050a1cb"}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, name: "differentname"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, phone: "098-765-4321"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, email: "different@example.com"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, service: "brake_adjustment"}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, preferred_at: "2026-12-01T15:00:00+02:00"}));

  assert.match(fingerprint(request1), /^[a-f0-9]{64}$/);

});