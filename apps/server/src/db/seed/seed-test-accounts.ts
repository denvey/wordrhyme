/**
 * Seed Test Accounts
 *
 * Sets up test accounts with passwords for manual testing.
 * Requires server to be running.
 *
 * Run: pnpm --filter @wordrhyme/server seed:test-accounts
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../../.env') });

const BASE_URL = process.env['AUTH_URL'] || 'http://localhost:3000';
const TEST_PASSWORD = 'Test123456';

// Test accounts to set up
const TEST_ACCOUNTS = [
    { email: 'owner@wordrhyme.test', name: 'Owner Test', role: 'owner' },
    { email: 'admin@wordrhyme.test', name: 'Admin Test', role: 'admin' },
    { email: 'member@wordrhyme.test', name: 'Member Test', role: 'member' },
];

async function seedTestAccounts() {
    console.log('🧪 Setting up Test Accounts...\n');
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Password: ${TEST_PASSWORD}\n`);

    for (const account of TEST_ACCOUNTS) {
        console.log(`📝 Creating ${account.role.toUpperCase()}: ${account.email}`);

        try {
            // Create user via sign-up API
            const signUpResponse = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: account.name,
                    email: account.email,
                    password: TEST_PASSWORD,
                }),
            });

            if (signUpResponse.ok) {
                console.log(`   ✅ Created: ${account.email}`);
            } else if (signUpResponse.status === 422) {
                console.log(`   ℹ️  Already exists: ${account.email}`);
            } else {
                const error = await signUpResponse.text();
                console.log(`   ⚠️  Failed (${signUpResponse.status}): ${error}`);
            }
        } catch (error) {
            console.log(`   ❌ Error: ${error}`);
        }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Test Accounts Ready!\n');
    console.log('📋 Credentials (Password: Test123456):\n');
    console.log('   | Role   | Email                    |');
    console.log('   |--------|--------------------------|');
    console.log('   | Owner  | owner@wordrhyme.test     |');
    console.log('   | Admin  | admin@wordrhyme.test     |');
    console.log('   | Member | member@wordrhyme.test    |');
    console.log('\n⚠️  Note: You need to manually assign roles via Admin UI');
    console.log('   or update the member table in the database.');
    console.log('='.repeat(60));
}

seedTestAccounts();
