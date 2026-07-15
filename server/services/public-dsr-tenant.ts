export function resolvePublicDsrTenantId(data: Record<string, unknown> = {}) {
  const candidate = typeof data.tenantId === 'string' && data.tenantId.trim().length > 0
    ? data.tenantId.trim()
    : process.env.DEFAULT_TENANT?.trim() || 'TENANT-001';

  return candidate;
}

export function resolvePublicDsrTargetControllerId(data: Record<string, unknown> = {}) {
  const candidate = typeof data.targetControllerId === 'string'
    ? data.targetControllerId.trim()
    : typeof data.controllerId === 'string'
      ? data.controllerId.trim()
      : '';

  return candidate.length > 0 ? candidate : null;
}
