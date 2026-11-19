import { servicesSchema } from './domain/service-validation.js';
import {test} from 'node:test';
import assert from "node:assert/strict";


let result = servicesSchema.safeParse('invalid-service');
console.log(result.success); // false
result = servicesSchema.safeParse('diagnostics');
console.log(result.success); // true

test('failed test', () => {
  let result = servicesSchema.safeParse('invalid-service');
  assert.equal(result.success, false);
})

test("valid test", () => {
  const result = servicesSchema.safeParse('diagnostics');

  assert.equal(result.success, true);
});