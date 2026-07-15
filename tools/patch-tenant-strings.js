const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'server', 'routes.ts'),
  path.join(__dirname, '..', 'server', 'routes_registry.ts'),
];

const replacements = [
  { re: /const tenantId = \(req\.user as any\)\?\.tenantId \|\| \"TENANT-001\";/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /const tenantId = \(req\.user as any\)\?\.tenantId \|\| \'TENANT-001\';/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /const tenantId = req\.user\?\.tenantId \|\| \"TENANT-001\";/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /const tenantId = req\.user\?\.tenantId \|\| \'TENANT-001\';/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /const tenantId = req\.user\?\.tenantId \?\? \"TENANT-001\";/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /const tenantId = req\.user\?\.tenantId \?\? \'TENANT-001\';/g, repl: 'const tenantId = tenantIdFromReq(req);' },
  { re: /tenantId: \"TENANT-001\"/g, repl: 'tenantId: tenantIdFromReq(req)' },
  { re: /tenantId: \'TENANT-001\'/g, repl: 'tenantId: tenantIdFromReq(req)' },
  { re: /\(req\.user as any\)\?\.tenantId \|\| \"TENANT-001\"/g, repl: 'tenantIdFromReq(req)' },
  { re: /\(req\.user as any\)\?\.tenantId \|\| \'TENANT-001\'/g, repl: 'tenantIdFromReq(req)' },
  { re: /req\.user\?\.tenantId \?\? \"TENANT-001\"/g, repl: 'tenantIdFromReq(req)' },
  { re: /req\.user\?\.tenantId \?\? \'TENANT-001\'/g, repl: 'tenantIdFromReq(req)' },
  { re: /req\.user\?\.tenantId \|\| \"TENANT-001\"/g, repl: 'tenantIdFromReq(req)' },
  { re: /req\.user\?\.tenantId \|\| \'TENANT-001\'/g, repl: 'tenantIdFromReq(req)' },
];

for (const file of files) {
  const orig = fs.readFileSync(file, 'utf8');
  let content = orig;
  for (const { re, repl } of replacements) {
    content = content.replace(re, repl);
  }
  if (content !== orig) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Patched ${file}`);
  } else {
    console.log(`No changes for ${file}`);
  }
}
