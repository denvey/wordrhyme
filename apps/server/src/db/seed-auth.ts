/**
 * Auth Seed Script
 * 
 * Creates a test admin user for development.
 * Run AFTER the server is started: pnpm --filter @wordrhyme/server seed:auth
 */

const BASE_URL = process.env.AUTH_URL || 'http://localhost:3000';

async function seedAuth() {
    console.log('🔐 Creating test admin user...');

    try {
        // Create user via sign-up API
        const signUpResponse = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Admin User',
                email: 'admin@example.com',
                password: 'admin123',
            }),
        });

        if (signUpResponse.ok) {
            const data = await signUpResponse.json();
            console.log('✅ Admin user created:', data.user?.email || 'admin@example.com');
        } else if (signUpResponse.status === 422) {
            console.log('ℹ️  User already exists or validation error');
            const error = await signUpResponse.json();
            console.log('   ', error.message || JSON.stringify(error));
        } else {
            console.log('⚠️  Signup returned:', signUpResponse.status);
            const error = await signUpResponse.text();
            console.log('   ', error);
        }

        // Create default organization
        console.log('🏢 Creating default organization...');

        // First, sign in to get a session
        const signInResponse = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'admin@example.com',
                password: 'admin123',
            }),
        });

        if (signInResponse.ok) {
            // Get cookies for auth
            const cookies = signInResponse.headers.get('set-cookie');

            // Create organization
            const orgResponse = await fetch(`${BASE_URL}/api/auth/organization/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookies || '',
                },
                body: JSON.stringify({
                    name: 'Default Organization',
                    slug: 'default',
                }),
            });

            if (orgResponse.ok) {
                console.log('✅ Default organization created');
            } else if (orgResponse.status === 422) {
                console.log('ℹ️  Organization already exists');
            } else {
                console.log('⚠️  Organization creation:', orgResponse.status);
            }
        }

        console.log('\n✅ Auth seed completed!');
        console.log('   Email: admin@example.com');
        console.log('   Password: admin123');
    } catch (error) {
        console.error('❌ Error:', error);
        console.log('\nMake sure the server is running first: pnpm --filter @wordrhyme/server dev');
    }
}

seedAuth();
