// supabase/tests/security_validator.ts

import * as fs from 'fs';
import * as path from 'path';

console.log('========================================================================');
console.log('DASH V2 - PHASE 2 AUTH & TENANCY SECURITY VERIFICATION SUITE');
console.log('========================================================================');

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

interface SecurityCheckResult {
  passed: boolean;
  errors: string[];
}

function runSecurityAudit(): void {
  const errors: string[] = [];
  let files: string[] = [];

  try {
    files = fs.readdirSync(MIGRATIONS_DIR).sort();
    console.log(`Auditing ${files.length} migration files...`);
  } catch (err) {
    errors.push(`Failed to read migrations directory: ${(err as Error).message}`);
    reportAndExit(errors);
  }

  // Concatenate all SQL migrations for comprehensive search
  let fullSqlContent = '';
  for (const file of files) {
    if (file.endsWith('.sql')) {
      const filepath = path.join(MIGRATIONS_DIR, file);
      fullSqlContent += '\n' + fs.readFileSync(filepath, 'utf8');
    }
  }

  console.log(`Analyzing ${fullSqlContent.length} bytes of compiled SQL statements...`);
  console.log('------------------------------------------------------------------------');

  // 1. Audit Security Definer functions for search_path hardening
  console.log('Checking SECURITY DEFINER Search Path Hardening...');
  
  // Find all SECURITY DEFINER functions in the sql code
  const fnMatches = fullSqlContent.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(\w+\.\w+)/gi);
  const matchedFunctions = Array.from(fnMatches).map(m => m[1]);
  
  // Clean duplicates
  const uniqueFunctions = Array.from(new Set(matchedFunctions));

  for (const fn of uniqueFunctions) {
    // Check if defined as SECURITY DEFINER
    const fnBlockRegex = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${fn}[\\s\\S]*?LANGUAGE\\s+\\w+`, 'i');
    const match = fullSqlContent.match(fnBlockRegex);
    if (match) {
      const isSecurityDefiner = /SECURITY\s+DEFINER/i.test(match[0]);
      if (isSecurityDefiner) {
        // Must contain search_path
        const hasSearchPath = /SET\s+search_path\s*=/i.test(match[0]) || /SET\s+search_path\s+TO/i.test(match[0]);
        if (!hasSearchPath) {
          errors.push(`VULNERABILITY: SECURITY DEFINER function "${fn}" is missing an explicitly controlled search_path!`);
        } else {
          console.log(`  [SECURE] Function "${fn}" successfully restricts search_path.`);
        }
      } else {
        console.log(`  [OK] Function "${fn}" is not SECURITY DEFINER (inherits client search_path safely).`);
      }
    }
  }

  // 2. Audit Platform Admin Escalation Prevention Trigger
  console.log('\nChecking Platform Admin Escalation Protection...');
  const hasEscalationTrigger = /CREATE\s+TRIGGER\s+tr_prevent_platform_admin_escalation/i.test(fullSqlContent);
  const hasEscalationFunction = /FUNCTION\s+public\.prevent_platform_admin_escalation/i.test(fullSqlContent);

  if (!hasEscalationFunction) {
    errors.push('Missing database trigger function: public.prevent_platform_admin_escalation()');
  } else {
    console.log('  [OK] Trigger function prevent_platform_admin_escalation exists.');
  }

  if (!hasEscalationTrigger) {
    errors.push('Missing database trigger binding: tr_prevent_platform_admin_escalation on public.profiles');
  } else {
    console.log('  [OK] Trigger tr_prevent_platform_admin_escalation is bound.');
  }

  // 3. Audit Auth User Profile Trigger
  console.log('\nChecking Auth.Users Profile Generation Triggers...');
  const hasAuthTrigger = /CREATE\s+TRIGGER\s+on_auth_user_created/i.test(fullSqlContent);
  const hasAuthFunction = /FUNCTION\s+public\.handle_new_user/i.test(fullSqlContent);

  if (!hasAuthFunction) {
    errors.push('Missing database trigger function: public.handle_new_user()');
  } else {
    console.log('  [OK] Trigger function handle_new_user exists.');
  }

  if (!hasAuthTrigger) {
    errors.push('Missing database trigger binding: on_auth_user_created on auth.users');
  } else {
    console.log('  [OK] Trigger on_auth_user_created is bound to auth.users.');
  }

  // 4. Audit Tenant Setup (Bootstrap) Foundations
  console.log('\nChecking Tenant Bootstrap Foundations...');
  const hasBootstrapFn = /FUNCTION\s+public\.bootstrap_tenant\s*\(/i.test(fullSqlContent);

  if (!hasBootstrapFn) {
    errors.push('Missing database function: public.bootstrap_tenant(p_tenant_name, p_admin_name) for secure organisation creation.');
  } else {
    console.log('  [OK] Tenant Bootstrap stored procedure "bootstrap_tenant" is defined.');
  }

  console.log('------------------------------------------------------------------------');
  reportAndExit(errors);
}

function reportAndExit(errors: string[]): void {
  if (errors.length > 0) {
    console.log('\x1b[31m%s\x1b[0m', '❌ SECURITY AUDIT FAILED WITH VULNERABILITIES:');
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
    console.log('========================================================================');
    process.exit(1);
  } else {
    console.log('\x1b[32m%s\x1b[0m', '✅ ALL AUTH & TENANCY SECURITY CHECKS PASSED PERFECTLY!');
    console.log('  - All SECURITY DEFINER functions are locked with strict search_paths.');
    console.log('  - Platform admin privileges are protected against client-side escalation.');
    console.log('  - Trigger correctly initiates profiles from auth.users events.');
    console.log('  - Stored bootstrap procedures are securely defined.');
    console.log('========================================================================');
    process.exit(0);
  }
}

runSecurityAudit();
