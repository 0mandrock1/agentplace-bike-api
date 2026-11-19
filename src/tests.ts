import { servicesSchema } from './domain/service-validation.js';
import {test} from 'node:test';
import assert from "node:assert/strict";
import type { Service } from './domain/services.js';


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