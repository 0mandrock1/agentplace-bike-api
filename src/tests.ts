import { servicesSchema } from './domain/service-validation.js';
import { test } from 'node:test';
import assert from "node:assert/strict";
import { customerSchema } from './domain/customer-validation.js';
import { requestSchema } from './domain/request-validation.js';
import type { Request } from './domain/request-validation.js';
import { openDatabase } from './db/sqlite.js';
import { initializeSchema } from './db/schema.js';
import { registerRequest } from './db/request-repository.js';
import { fingerprint } from './domain/payload-fingerprint.js';
import { z } from 'zod';
import { buildApp } from './app.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Test invalid service', () => {
  const result = servicesSchema.safeParse('invalid-service');
  assert.equal(result.success, false);
})

test("Test valid service", () => {
  const result = servicesSchema.safeParse('diagnostics');
  assert.ok(result.success);
  assert.equal(result.data, "diagnostics");
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
    email: "test@example.com",
    phone: "+12025550100"
  };
  assert.doesNotThrow(() => {
    const result = customerSchema.parse(validCustomer);
    assert.ok(result);
  });
});

test("Test Customer schema without email", () => {
  const invalidCustomer = {
    name: "John Doe",
    phone: "+12025550100"
  };
  assert.throws(() => {
    customerSchema.parse(invalidCustomer);
  });
});

test("Test Customer Schema with empty name", () => {
  const invalidCustomer = {
    name: "",
    email: "test@example.com",
    phone: "+12025550100"
  };
  assert.throws(() => {
    customerSchema.parse(invalidCustomer);
  });
});
test("Test Customer Schema with empty phone", () => {
  const invalidCustomer = {
    name: "John Doe",
    email: "test@example.com",
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
      email: "test@example.com",
      phone: "+12025550100"
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
      email: "test@example.com",
      phone: "+12025550100"
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
      email: "test@example.com",
      phone: "+12025550100"
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
      email: "test@example.com",
      phone: "+12025550100"
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
      email: "test@example.com",
      phone: "+12025550100"
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
        phone: "+12025550100"
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
        phone: "+12025550100"
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
        phone: "+12025550100"
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
        phone: "+12025550100"
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
      phone: "+12025550100"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  });
  const request2 : Request =  {
    service: "diagnostics",
    test: true,
    preferred_at: "2026-12-01T14:00:00+02:00",
    customer: {
      phone: "+12025550100",
      name: "John Doe",
      email: "test@example.com"
    },
    idempotency_key: "2b2502ac-e045-4e8a-b900-4686b050a1cb"
  };

  assert.equal(fingerprint(request1), fingerprint(request2));
  assert.equal(fingerprint(request1), fingerprint({...request1,idempotency_key: "2b2502ac-e045-4e8a-b900-4686b050a1cb"}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, name: "differentname"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, phone: "+12025550101"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, customer: {...request1.customer, email: "different@example.com"}}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, service: "brake_adjustment"}));
  assert.notEqual(fingerprint(request1), fingerprint({...request1, preferred_at: "2026-12-01T15:00:00+02:00"}));

  assert.match(fingerprint(request1), /^[a-f0-9]{64}$/);

});

test("Tests health endpoint", async () => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
    const response = await app.inject({
    method: 'GET',
    url: '/health'
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {"status":"ok"});
} finally {
  await app.close();
  assert.equal (db.open, false);
}
});
test("Tests services endpoint", async () => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/services'
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), ['diagnostics','basic_maintenance', 'puncture_repair', 'brake_adjustment', 'gear_adjustment']);
  } finally {
    await app.close();
    assert.equal (db.open, false);
  }
});


test("Tests /v1/requests endpoint with valid payload", async () => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
    const requestValid : Request = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@example.com",
      phone: "+12025550100"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
    const requestDouble : Request = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      email: "test@example.com",
      phone: "+12025550100"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
    const requestDoubleChangedPayload : Request = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "Jane Doe",
      email: "test@example.com",
      phone: "+12025550100"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };

  const responseSchema = z.strictObject({
    request_id: z.uuid(),
    status: z.literal("received"),
    replayed: z.boolean(),
    test_only: z.literal(true)
  })
  const responseValid = await app.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: requestValid
  });
  assert.equal(responseValid.statusCode,201)
  const validBody = responseSchema.parse(responseValid.json())
  const validUUID = validBody.request_id
  const valid = db.prepare (
    'SELECT request_id FROM requests WHERE request_id = ?'
  ).get(validUUID) as {request_id:string};
  assert.equal(validUUID,valid.request_id);
  assert.deepEqual(false,validBody.replayed);
  let count = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
  ).get();
  assert.deepEqual(count, { count: 1 });
  const responseDouble = await app.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: requestDouble
  });
  assert.equal(responseDouble.statusCode,200)
  const doubleBody = responseSchema.parse(responseDouble.json())
  assert.equal(validUUID,doubleBody.request_id)
  assert.deepEqual(true,doubleBody.replayed)

  count = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
  ).get();
  assert.deepEqual(count, { count: 1 });

  const rows = db.prepare(
    'SELECT * FROM requests'
  );
  const rowsBefore = rows.all()
  const responseDoubleChangedPayload = await app.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: requestDoubleChangedPayload
  });
  const rowsAfter = rows.all();
  assert.deepEqual(rowsBefore,rowsAfter);
  assert.equal(responseDoubleChangedPayload.statusCode,409)
  assert.deepEqual(responseDoubleChangedPayload.json(),{
    error: "idempotency_conflict"
  })

  } finally {
    await app.close()
  }

})

test("Tests /v1/requests endpoint with invalid payload", async () => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
  const requestInvalid  = {
    test: true,
    service: "diagnostics",
    customer: {
      name: "John Doe",
      phone: "+12025550100"
    },
    idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
    preferred_at: "2026-12-01T14:00:00+02:00"
  };
  const responseInvalid = await app.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: requestInvalid
  });
  assert.equal(responseInvalid.statusCode,422);
  assert.deepEqual(responseInvalid.json(),{
    error: "invalid_request"
      });

  const row = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
  ).get();
  assert.deepEqual(row, { count: 0 });


  } finally {
    await app.close()
  }

})
test("Test error handler on synthetic endpoint",async ()=> {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
  app.get('/test-error', () => {
    throw new Error('Secret diagnostic message');
  });
  const failedRequest = await app.inject ({
    method: "GET",
    url: "/test-error"
  });
  assert.deepEqual(failedRequest.statusCode,500);
  assert.deepEqual(failedRequest.json(),{error: 'internal_error'});
  } finally {
      await app.close()
  }
})

test("Test error handler on invalid JSON body", async() =>{
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try  {
    const response = await app.inject({
    method: 'POST',
    url: '/v1/requests'   ,
    headers: {
        'content-type': 'application/json'
    },
    payload: '{"broken":'
    });
    assert.deepEqual(response.statusCode,400);
    assert.deepEqual(response.json(),{"error":"invalid_request"})
  }
  finally {
    await app.close()
  }
})

test("Test service unavailable error using header x-test-fault:prewrite", async() => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db,{enableFaultInjection:true});
  try {
    const requestValid : Request = {
        test: true,
        service: "diagnostics",
        customer: {
          name: "John Doe",
          email: "test@example.com",
          phone: "+12025550100"
        },
        idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
        preferred_at: "2026-12-01T14:00:00+02:00"
      };
    const responsePrewrite = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      headers: {
          'x-test-fault': 'prewrite'
      },
      payload: requestValid
    });
    let count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    assert.deepEqual(count, { count: 0 });
    assert.deepEqual(responsePrewrite.statusCode,503);
    assert.deepEqual(responsePrewrite.json(),{"error": "service_unavailable"})
    const response = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      payload: requestValid
    });
    count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    assert.deepEqual(count, { count: 1 });
    assert.deepEqual(response.statusCode,201);
  } finally {
    await app.close()
  }

})

test("Test service unavailable error using header x-test-fault:lost_ack", async() => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db,{enableFaultInjection: true});
  try {
    const requestValid : Request = {
        test: true,
        service: "diagnostics",
        customer: {
          name: "John Doe",
          email: "test@example.com",
          phone: "+12025550100"
        },
        idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
        preferred_at: "2026-12-01T14:00:00+02:00"
      };
    const responseLostAck = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      headers: {
          'x-test-fault': 'lost_ack'
      },
      payload: requestValid
    });
    let count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    const allFirst  = db.prepare (
      'SELECT * FROM requests'
    ).all();
    assert.deepEqual(count, { count: 1 });
    assert.deepEqual(responseLostAck.statusCode,503);
    assert.deepEqual(responseLostAck.json(),{"error": "service_unavailable"})
    const responseLostAckReplay = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      headers: {
          'x-test-fault': 'lost_ack'
      },
      payload: requestValid
    });
    count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    const row = db.prepare(
      'SELECT request_id FROM requests'
    ).get() as {request_id : string}
    const allSecond  = db.prepare (
      'SELECT * FROM requests'
    ).all();
    assert.deepEqual(count, { count: 1 });
    assert.deepEqual(responseLostAckReplay.statusCode,200);
    assert.equal(row.request_id,responseLostAckReplay.json().request_id);
    assert.deepEqual(true,responseLostAckReplay.json().replayed);
    assert.deepEqual(allFirst,allSecond);
  } finally {
    await app.close()
  }

})
test("Test service ignore headers x-test-fault while process env is not defined", async() => {
  const db = openDatabase(':memory:');
  initializeSchema(db);

  const app = buildApp(db);
  try {
    const requestValid : Request = {
        test: true,
        service: "diagnostics",
        customer: {
          name: "John Doe",
          email: "test@example.com",
          phone: "+12025550100"
        },
        idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
        preferred_at: "2026-12-01T14:00:00+02:00"
      };
    const requestValid2 : Request = {
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "+12025550100"
      },
      idempotency_key: "786fa616-e915-11f1-b6ef-00155d8dae61",
      preferred_at: "2026-12-01T14:00:00+02:00"
     };
    const responsePrewrite = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      headers: {
          'x-test-fault': 'prewrite'
      },
      payload: requestValid
    });
    let count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    assert.deepEqual(count, { count: 1 });
    assert.deepEqual(responsePrewrite.statusCode,201);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      headers: {
          'x-test-fault': 'lost_ack'
      },
      payload: requestValid2
    });
    count = db.prepare(
        'SELECT COUNT(*) AS count FROM requests'
    ).get();
    assert.deepEqual(count, { count: 2 });
    assert.deepEqual(response.statusCode,201);
  } finally {
    await app.close()
  }

})

test("Test temp directory sync using requestCreate",async() => {
  const directory = mkdtempSync(
    join(tmpdir(), 'demo-')
);
try {

  const filename = join(directory, 'example.db');
  const db = openDatabase(filename);
  initializeSchema(db);
  const app = buildApp(db);
  let firstRequestId: string;
  try {
    const request : Request = {
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "+12025550100"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    };
    const result = await app.inject({
      method: 'POST',
      url: '/v1/requests'   ,
      payload: request
    });
    firstRequestId = result.json().request_id;
  assert.deepEqual(result.statusCode,201);
  const count = db.prepare(
      'SELECT COUNT(*) AS count FROM requests'
  ).get();
  assert.deepEqual(count, { count: 1 });
} finally {
 await app.close()
}
 const db2 = openDatabase(filename);
 initializeSchema(db2);
 const app2 = buildApp(db2);

 try {
  const request : Request = {
      test: true,
      service: "diagnostics",
      customer: {
        name: "John Doe",
        email: "test@example.com",
        phone: "+12025550100"
      },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    };
  const result = await app2.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: request
  });
  const count = db2.prepare(
      'SELECT COUNT(*) AS count FROM requests'
  ).get();
  assert.deepEqual(count, { count: 1 });

  assert.deepEqual(result.statusCode,200);
  assert.deepEqual(firstRequestId, result.json().request_id)
  assert.deepEqual(true,result.json().replayed)
} finally {
  await app2.close();
}} finally {
    rmSync(directory, {
        recursive: true,
        force: true
    });
}
})
test("Synthetic contact policy accepts only reserved email and phone ranges", () => {
  const valid = { name: "Synthetic Rider", email: "rider@example.com", phone: "+12025550100" };
  for (const email of ["rider@example.com", "rider@EXAMPLE.NET", "rider@example.org", "rider@bike.test"]) {
    assert.ok(customerSchema.safeParse({ ...valid, email }).success, email);
  }
  for (const email of ["rider@gmail.com", "rider@example.com.evil.com", "rider@notexample.com", "rider@invalid"]) {
    assert.equal(customerSchema.safeParse({ ...valid, email }).success, false, email);
  }
  for (const phone of ["+12025550100", "+12025550199"]) {
    assert.ok(customerSchema.safeParse({ ...valid, phone }).success, phone);
  }
  for (const phone of ["+12025550099", "+12025550200", "+380501234567", " ", "123"]) {
    assert.equal(customerSchema.safeParse({ ...valid, phone }).success, false, phone);
  }
  assert.equal(customerSchema.safeParse({ ...valid, name: "   " }).success, false);
  assert.equal(customerSchema.parse({ ...valid, name: "  Synthetic Rider  " }).name, valid.name);
});

test("API rejects non-synthetic contacts without persisting requests", async () => {
  const db = openDatabase(':memory:');
  initializeSchema(db);
  const app = buildApp(db);
  try {
    const valid = {
      test: true,
      service: "diagnostics",
      customer: { name: "Synthetic Rider", email: "rider@example.com", phone: "+12025550100" },
      idempotency_key: "1a1502ac-e045-4e8a-b900-4686b050a1cb",
      preferred_at: "2026-12-01T14:00:00+02:00"
    };
    for (const patch of [{ email: "rider@gmail.com" }, { phone: "+380501234567" }, { name: " " }]) {
      const response = await app.inject({
        method: "POST", url: "/v1/requests",
        payload: { ...valid, customer: { ...valid.customer, ...patch } }
      });
      assert.equal(response.statusCode, 422);
      assert.deepEqual(response.json(), { error: "invalid_request" });
      assert.deepEqual(db.prepare("SELECT COUNT(*) AS count FROM requests").get(), { count: 0 });
    }
    const response = await app.inject({ method: "POST", url: "/v1/requests", payload: valid });
    assert.equal(response.statusCode, 201);
    assert.deepEqual(db.prepare("SELECT COUNT(*) AS count FROM requests").get(), { count: 1 });
  } finally {
    await app.close();
  }
});
