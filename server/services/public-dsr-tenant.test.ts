import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePublicDsrTenantId, resolvePublicDsrTargetControllerId } from './public-dsr-tenant.ts';

test('uses an explicit tenant from the payload when provided', () => {
  assert.equal(resolvePublicDsrTenantId({ tenantId: 'TENANT-007' }), 'TENANT-007');
});

test('falls back to the default tenant when the payload omits one', () => {
  assert.equal(resolvePublicDsrTenantId({}), 'TENANT-001');
});

test('prefers the environment override when it is set', () => {
  process.env.DEFAULT_TENANT = 'TENANT-123';
  try {
    assert.equal(resolvePublicDsrTenantId({}), 'TENANT-123');
  } finally {
    delete process.env.DEFAULT_TENANT;
  }
});

test('normalizes a public DSR target controller id when provided', () => {
  assert.equal(resolvePublicDsrTargetControllerId({ targetControllerId: ' ctrl-123 ' }), 'ctrl-123');
});

test('returns null when no public DSR target controller id is provided', () => {
  assert.equal(resolvePublicDsrTargetControllerId({}), null);
});
