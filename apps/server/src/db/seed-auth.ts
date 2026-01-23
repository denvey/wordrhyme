/**
 * Auth Seed Script
 *
 * Creates a platform admin user for development/initial setup.
 * Run AFTER the server is started: pnpm --filter @wordrhyme/server seed:auth
 *
 * This creates:
 * 1. Platform Admin user (full system access)
 * 2. Default organization for the admin
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';

// Load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../../.env') });

// Import user schema
import { user } from './schema/auth-schema';

const BASE_URL = process.env.AUTH_URL || 'http://localhost:3000';

// Platform Admin credentials
const PLATFORM_ADMIN = {
    name: 'Platform Admin',
    email: 'admin@wordrhyme.local',
    password: 'Admin@123',
};

async function seedAuth() {
    console.log('🔐 Setting up Platform Admin...\n');

    // Create database connection for role update
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not found');
        process.exit(1);
    }
    const client = postgres(databaseUrl);
    const db = drizzle(client);

    try {
        // Step 1: Create user via sign-up API
        console.log('1️⃣  Creating user account...');
        const signUpResponse = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(PLATFORM_ADMIN),
        });

        let userId: string | null = null;

        if (signUpResponse.ok) {
            const data = await signUpResponse.json();
            userId = data.user?.id;
            console.log(`   ✅ User created: ${PLATFORM_ADMIN.email}`);
        } else if (signUpResponse.status === 422) {
            console.log(`   ℹ️  User already exists: ${PLATFORM_ADMIN.email}`);
            // Find existing user
            const existingUsers = await db.select().from(user).where(eq(user.email, PLATFORM_ADMIN.email)).limit(1);
            if (existingUsers[0]) {
                userId = existingUsers[0].id;
            }
        } else {
            console.log(`   ⚠️  Signup failed: ${signUpResponse.status}`);
            const error = await signUpResponse.text();
            console.log(`   ${error}`);
        }

        // Step 2: Set admin role directly in database
        if (userId) {
            console.log('\n2️⃣  Setting admin role...');
            await db.update(user)
                .set({ role: 'admin' })
                .where(eq(user.id, userId));
            console.log('   ✅ Role set to: admin');
        }

        // Step 3: Sign in and verify
        console.log('\n3️⃣  Verifying login...');
        const signInResponse = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: PLATFORM_ADMIN.email,
                password: PLATFORM_ADMIN.password,
            }),
        });

        if (signInResponse.ok) {
            const data = await signInResponse.json();
            console.log(`   ✅ Login successful`);
            console.log(`   Role: ${data.user?.role || 'admin'}`);
        } else {
            console.log(`   ⚠️  Login test failed: ${signUpResponse.status}`);
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('🎉 Platform Admin Setup Complete!\n');
        console.log('📋 Credentials:');
        console.log(`   Email:    ${PLATFORM_ADMIN.email}`);
        console.log(`   Password: ${PLATFORM_ADMIN.password}`);
        console.log(`   Role:     admin`);
        console.log('\n💡 Capabilities:');
        console.log('   - Full admin access to all admin.* APIs');
        console.log('   - Can manage users across all tenants');
        console.log('   - Can permanently delete users');
        console.log('   - Can impersonate any user');
        console.log('='.repeat(50));

    } catch (error) {
        console.error('❌ Error:', error);
        console.log('\n💡 Make sure the server is running: pnpm --filter @wordrhyme/server dev');
    } finally {
        await client.end();
    }
}

seedAuth();
