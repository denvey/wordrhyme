/**
 * Test CASL "all" subject behavior
 */
import { createMongoAbility } from '@casl/ability';

type Actions = 'manage' | 'read' | 'create' | 'update' | 'delete';
type Subjects = 'all' | 'Menu' | 'User' | 'Content' | 'Settings';

async function testCASL() {
    console.log('🧪 Testing CASL "all" subject behavior\n');

    // Test 1: Basic "all" subject rule
    console.log('📋 Test 1: Can "manage" "all" grant all permissions?');
    console.log('='.repeat(60));

    const ability1 = createMongoAbility<[Actions, Subjects]>([
        { action: 'manage', subject: 'all' }
    ], {
        resolveAction(action: string) {
            return action === 'manage' ? ['manage', 'create', 'read', 'update', 'delete'] : action;
        },
    });

    const tests = [
        { action: 'manage', subject: 'Menu' },
        { action: 'read', subject: 'Menu' },
        { action: 'manage', subject: 'User' },
        { action: 'read', subject: 'Content' },
        { action: 'create', subject: 'Settings' },
    ];

    tests.forEach(({ action, subject }) => {
        const result = ability1.can(action as Actions, subject as Subjects);
        console.log(`  can('${action}', '${subject}') -> ${result ? '✅ PASS' : '❌ FAIL'}`);
    });

    console.log('\n' + '='.repeat(60));

    // Test 2: Check if 'all' is recognized as keyword
    console.log('\n📋 Test 2: Compare "all" vs specific subjects');
    console.log('='.repeat(60));

    const ability2WithAll = createMongoAbility<[Actions, Subjects]>([
        { action: 'manage', subject: 'all' }
    ], {
        resolveAction(action: string) {
            return action === 'manage' ? ['manage', 'create', 'read', 'update', 'delete'] : action;
        },
    });

    const ability2Specific = createMongoAbility<[Actions, Subjects]>([
        { action: 'manage', subject: 'Menu' },
        { action: 'manage', subject: 'User' },
        { action: 'manage', subject: 'Content' },
    ], {
        resolveAction(action: string) {
            return action === 'manage' ? ['manage', 'create', 'read', 'update', 'delete'] : action;
        },
    });

    console.log('\nWith subject="all":');
    console.log(`  can('read', 'Menu') -> ${ability2WithAll.can('read', 'Menu') ? '✅' : '❌'}`);
    console.log(`  can('read', 'Settings') -> ${ability2WithAll.can('read', 'Settings') ? '✅' : '❌'}`);

    console.log('\nWith specific subjects (Menu, User, Content):');
    console.log(`  can('read', 'Menu') -> ${ability2Specific.can('read', 'Menu') ? '✅' : '❌'}`);
    console.log(`  can('read', 'Settings') -> ${ability2Specific.can('read', 'Settings') ? '✅' : '❌'}`);

    console.log('\n' + '='.repeat(60));

    // Test 3: Verify our exact rule structure
    console.log('\n📋 Test 3: Test with exact DB rule structure');
    console.log('='.repeat(60));

    const dbRule = {
        action: 'manage',
        subject: 'all',
        fields: null,
        conditions: null,
        inverted: false,
    };

    const ability3 = createMongoAbility<[Actions, Subjects]>([dbRule], {
        resolveAction(action: string) {
            return action === 'manage' ? ['manage', 'create', 'read', 'update', 'delete'] : action;
        },
    });

    console.log('Rule:', JSON.stringify(dbRule, null, 2));
    console.log('\nTest results:');
    tests.forEach(({ action, subject }) => {
        const result = ability3.can(action as Actions, subject as Subjects);
        console.log(`  can('${action}', '${subject}') -> ${result ? '✅' : '❌'}`);
    });

    console.log('\n' + '='.repeat(60));
}

testCASL().catch(console.error);
