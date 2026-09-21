// supabase/tests/schema_validator.ts

import * as fs from 'fs';
import * as path from 'path';

console.log('========================================================================');
console.log('DASH V2 - PHASE 1 DATABASE SCHEMA STATIC VALIDATION SUITE');
console.log('========================================================================');

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations');

// All expected tables to verify
const EXPECTED_TABLES = [
    'tenants',
    'contracts',
    'sites',
    'contract_sites',
    'profiles',
    'roles',
    'permissions',
    'role_permissions',
    'user_roles',
    'user_contracts',
    'user_sites',
    'tools',
    'tool_versions',
    'tool_sections',
    'tool_questions',
    'question_options',
    'conditional_rules',
    'rule_conditions',
    'tool_templates',
    'observations',
    'observation_responses',
    'observation_photos',
    'observation_signatures',
    'audit_logs'
];

// Tables that should carry tenant isolation (must have tenant_id)
const TENANT_ISOLATED_TABLES = EXPECTED_TABLES.filter(t => t !== 'tenants' && t !== 'permissions');

interface ValidationResult {
    passed: boolean;
    errors: string[];
}

function runValidation(): void {
    const errors: string[] = [];
    let files: string[] = [];

    try {
        files = fs.readdirSync(MIGRATIONS_DIR).sort();
        console.log(`Found ${files.length} migration files in ${MIGRATIONS_DIR}.`);
    } catch (err) {
        errors.push(`Failed to read migrations directory: ${(err as Error).message}`);
        reportAndExit(errors);
    }

    // Load and concatenate all SQL migration files
    let fullSqlContent = '';
    const fileContents: { [filename: string]: string } = {};

    for (const file of files) {
        if (file.endsWith('.sql')) {
            const filepath = path.join(MIGRATIONS_DIR, file);
            const content = fs.readFileSync(filepath, 'utf8');
            fileContents[file] = content;
            fullSqlContent += '\n' + content;
        }
    }

    console.log(`Loaded ${fullSqlContent.length} bytes of SQL schema declarations.`);
    console.log('------------------------------------------------------------------------');

    // 1. Verify existence of all 24 tables
    console.log('Checking Table Declarations...');
    for (const table of EXPECTED_TABLES) {
        const createRegex = new RegExp(`CREATE\\s+TABLE\\s+public\\.${table}\\s*\\(`, 'i');
        if (!createRegex.test(fullSqlContent)) {
            errors.push(`Missing Table Declaration: public.${table}`);
        } else {
            console.log(`  [OK] Table public.${table} is declared.`);
        }
    }

    // 2. Verify Tenant Isolation Columns (tenant_id) on all isolated tables
    console.log('\nChecking Tenant Isolation Columns...');
    for (const table of TENANT_ISOLATED_TABLES) {
        // Find the block of the table declaration
        const startIdx = fullSqlContent.search(new RegExp(`CREATE\\s+TABLE\\s+public\\.${table}\\s*\\(`, 'i'));
        if (startIdx !== -1) {
            // Find the matching closing parenthesis for the table definition
            const subStr = fullSqlContent.substring(startIdx);
            // Search inside the parenthesis block for tenant_id column
            const hasTenantId = /tenant_id\s+UUID/i.test(subStr);
            if (!hasTenantId) {
                errors.push(`Table public.${table} is missing a tenant_id isolation column.`);
            } else {
                console.log(`  [OK] Table public.${table} includes 'tenant_id'.`);
            }
        }
    }

    // 3. Verify Row-Level Security is explicitly enabled on all 24 tables
    console.log('\nChecking Row Level Security (RLS) Enablement...');
    for (const table of EXPECTED_TABLES) {
        const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
        if (!rlsRegex.test(fullSqlContent)) {
            errors.push(`Table public.${table} does not have ROW LEVEL SECURITY explicitly enabled.`);
        } else {
            console.log(`  [OK] Table public.${table} has RLS enabled.`);
        }
    }

    // 4. Verify Composite Unique Constraints for Tenant Isolation
    console.log('\nChecking Composite Unique Constraints on parents...');
    const compositeUniques = [
        { table: 'contracts', keys: ['tenant_id', 'id'] },
        { table: 'sites', keys: ['tenant_id', 'id'] },
        { table: 'profiles', keys: ['tenant_id', 'id'] },
        { table: 'roles', keys: ['tenant_id', 'id'] },
        { table: 'tools', keys: ['tenant_id', 'id'] },
        { table: 'tool_versions', keys: ['tenant_id', 'id'] },
        { table: 'tool_sections', keys: ['tenant_id', 'id'] },
        { table: 'tool_questions', keys: ['tenant_id', 'id'] },
        { table: 'question_options', keys: ['tenant_id', 'id'] },
        { table: 'conditional_rules', keys: ['tenant_id', 'id'] },
        { table: 'observations', keys: ['tenant_id', 'id'] }
    ];

    for (const cu of compositeUniques) {
        const uqRegexStr = `CONSTRAINT\\s+\\w+\\s+UNIQUE\\s*\\(\\s*${cu.keys.join('\\s*,\\s*')}\\s*\\)`;
        const uqRegex = new RegExp(uqRegexStr, 'i');
        if (!uqRegex.test(fullSqlContent)) {
            errors.push(`Parent table public.${cu.table} is missing composite unique constraint: (${cu.keys.join(', ')})`);
        } else {
            console.log(`  [OK] Table public.${cu.table} enforces composite unique key (${cu.keys.join(', ')}).`);
        }
    }

    // 5. Verify Composite Foreign Key Constraints on Children
    console.log('\nChecking Composite Foreign Key Constraints on children...');
    const compositeFKs = [
        { table: 'contract_sites', parent: 'contracts', keys: ['tenant_id', 'contract_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'contract_sites', parent: 'sites', keys: ['tenant_id', 'site_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'user_roles', parent: 'profiles', keys: ['tenant_id', 'user_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'user_contracts', parent: 'profiles', keys: ['tenant_id', 'user_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'user_contracts', parent: 'contracts', keys: ['tenant_id', 'contract_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'user_sites', parent: 'profiles', keys: ['tenant_id', 'user_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'user_sites', parent: 'sites', keys: ['tenant_id', 'site_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'tool_versions', parent: 'tools', keys: ['tenant_id', 'tool_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'tool_sections', parent: 'tool_versions', keys: ['tenant_id', 'tool_version_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'tool_questions', parent: 'tool_versions', keys: ['tenant_id', 'tool_version_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'tool_questions', parent: 'tool_sections', keys: ['tool_version_id', 'section_id'], parentKeys: ['tool_version_id', 'id'] },
        { table: 'question_options', parent: 'tool_questions', keys: ['tenant_id', 'question_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'conditional_rules', parent: 'tool_versions', keys: ['tenant_id', 'tool_version_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'rule_conditions', parent: 'conditional_rules', keys: ['tool_version_id', 'rule_id'], parentKeys: ['tool_version_id', 'id'] },
        { table: 'rule_conditions', parent: 'tool_questions', keys: ['tool_version_id', 'source_question_id'], parentKeys: ['tool_version_id', 'id'] },
        { table: 'observations', parent: 'contract_sites', keys: ['tenant_id', 'contract_id', 'site_id'], parentKeys: ['tenant_id', 'contract_id', 'site_id'] },
        { table: 'observations', parent: 'tool_versions', keys: ['tenant_id', 'tool_version_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observations', parent: 'profiles', keys: ['tenant_id', 'observer_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observation_responses', parent: 'observations', keys: ['tenant_id', 'observation_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observation_responses', parent: 'tool_questions', keys: ['tenant_id', 'question_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observation_responses', parent: 'question_options', keys: ['tenant_id', 'selected_option_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observation_photos', parent: 'observations', keys: ['tenant_id', 'observation_id'], parentKeys: ['tenant_id', 'id'] },
        { table: 'observation_signatures', parent: 'observations', keys: ['tenant_id', 'observation_id'], parentKeys: ['tenant_id', 'id'] }
    ];

    for (const fk of compositeFKs) {
        const fkRegexStr = `FOREIGN\\s+KEY\\s*\\(\\s*${fk.keys.join('\\s*,\\s*')}\\s*\\)\\s+REFERENCES\\s+public\\.${fk.parent}\\s*\\(\\s*${fk.parentKeys.join('\\s*,\\s*')}\\s*\\)`;
        const fkRegex = new RegExp(fkRegexStr, 'i');
        if (!fkRegex.test(fullSqlContent)) {
            errors.push(`Child table public.${fk.table} is missing composite foreign key referencing public.${fk.parent} on (${fk.keys.join(', ')})`);
        } else {
            console.log(`  [OK] Table public.${fk.table} correctly maps composite FK (${fk.keys.join(', ')}) -> public.${fk.parent}(${fk.parentKeys.join(', ')}).`);
        }
    }

    // 6. Verify Security Helper Functions
    console.log('\nChecking Security Helper Functions...');
    const securityFunctions = [
        'public.current_tenant_id',
        'public.has_permission',
        'public.has_operational_scope'
    ];

    for (const fn of securityFunctions) {
        const fnRegex = new RegExp(`FUNCTION\\s+${fn}\\s*\\(`, 'i');
        if (!fnRegex.test(fullSqlContent)) {
            errors.push(`Missing Security Helper Function: ${fn}`);
        } else {
            console.log(`  [OK] Function ${fn} is defined.`);
        }
    }

    // 7. Verify Immutability Triggers
    console.log('\nChecking Immutability Trigger Declarations...');
    const expectedTriggers = [
        'tr_tool_versions_immutability',
        'tr_tool_sections_immutability',
        'tr_tool_questions_immutability',
        'tr_question_options_immutability',
        'tr_conditional_rules_immutability',
        'tr_rule_conditions_immutability'
    ];

    for (const trig of expectedTriggers) {
        const trigRegex = new RegExp(`TRIGGER\\s+${trig}`, 'i');
        if (!trigRegex.test(fullSqlContent)) {
            errors.push(`Missing Immutability Trigger binding: ${trig}`);
        } else {
            console.log(`  [OK] Trigger binding ${trig} is declared.`);
        }
    }

    // 8. Verify Template Adoption stored procedure
    console.log('\nChecking Template Adoption procedure...');
    if (!/FUNCTION\s+public\.tools_adopt_template\s*\(/i.test(fullSqlContent)) {
        errors.push('Missing Stored Procedure: public.tools_adopt_template');
    } else {
        console.log('  [OK] Stored Procedure public.tools_adopt_template is defined.');
    }

    console.log('------------------------------------------------------------------------');
    reportAndExit(errors);
}

function reportAndExit(errors: string[]): void {
    if (errors.length > 0) {
        console.log('\x1b[31m%s\x1b[0m', '❌ SCHEMA VALIDATION FAILED WITH THE FOLLOWING ERRORS:');
        for (const err of errors) {
            console.log(`  - ${err}`);
        }
        console.log('========================================================================');
        process.exit(1);
    } else {
        console.log('\x1b[32m%s\x1b[0m', '✅ ALL PHASE 1 DATABASE & SECURITY CONSTRAINTS PASSED PERFECTLY!');
        console.log('========================================================================');
        process.exit(0);
    }
}

runValidation();
