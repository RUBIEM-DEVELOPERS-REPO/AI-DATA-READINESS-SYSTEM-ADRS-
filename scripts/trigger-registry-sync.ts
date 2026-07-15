import { listExternalIntegrations, syncExternalIntegration } from '../server/services/registry';

async function main() {
  try {
    const tenantId = 'TENANT-001';
    const integrations = await listExternalIntegrations(tenantId);
    if (!integrations || integrations.length === 0) {
      console.error('No integrations found');
      process.exit(1);
    }
    const target = integrations[0];
    console.log('Triggering sync for integration:', target.id, target.displayName || target.systemName);
    const res = await syncExternalIntegration(target.id, tenantId);
    console.log('Sync result:', res);
    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(2);
  }
}

main();
