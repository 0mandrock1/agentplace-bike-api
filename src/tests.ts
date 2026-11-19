import { servicesSchema } from './domain/service-validation.js';
import {test} from 'node:test';
import assert from "node:assert/strict";
import type { Service } from './domain/services.js';
import { customerSchema } from './domain/customer-validation.js';
import { requestSchema } from './domain/request-validation.js';
import { openDatabase } from './db/sqlite.js';


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
    const row = db.prepare('SELECT 1 AS answer').get() as { answer: number };
    assert.equal(row.answer, 1);  
  } finally {
    db.close();
  }
});