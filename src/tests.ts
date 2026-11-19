import { servicesSchema } from './domain/service-validation.js';
import {test} from 'node:test';
import assert from "node:assert/strict";
import type { Service } from './domain/services.js';
import { customerSchema } from './domain/customer-validation.js';


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
