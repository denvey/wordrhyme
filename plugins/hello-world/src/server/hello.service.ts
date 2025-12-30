import { Injectable } from '@nestjs/common';

/**
 * Hello World Service
 * 
 * Demonstrates NestJS Service pattern in a plugin.
 * Uses dependency injection and encapsulates business logic.
 * 
 * This shows the "Advanced Plugin" mode where plugins can use
 * NestJS features like DI, decorators, and modular architecture.
 */
@Injectable()
export class HelloService {
    private readonly tableName = 'plugin_com_wordrhyme_hello-world_greetings';

    /**
     * Generate a greeting message
     */
    getGreeting(name: string): string {
        return `Hello, ${name}! (from NestJS Service)`;
    }

    /**
     * Create a new greeting in the database
     */
    async createGreeting(
        name: string,
        message: string,
        tenantId?: string,
        metadata?: Record<string, unknown>
    ): Promise<{ id: string; name: string; message: string; createdAt: Date }> {
        const id = crypto.randomUUID();
        const createdAt = new Date();

        console.log(`[HelloService] Creating greeting: ${name} - ${message}`);

        // Note: This would use ctx.db in production
        // For demonstration, we just return the data
        return {
            id,
            name,
            message,
            createdAt,
        };
    }

    /**
     * List all greetings
     */
    async listGreetings(
        tenantId?: string,
        limit = 10
    ): Promise<Array<{ id: string; name: string; message: string; createdAt: Date }>> {
        console.log(`[HelloService] Listing greetings for tenant: ${tenantId}`);

        // Mock data for demonstration
        return [
            {
                id: '1',
                name: 'Alice',
                message: 'Hello from NestJS Service!',
                createdAt: new Date(),
            },
            {
                id: '2',
                name: 'Bob',
                message: 'Greetings via DI!',
                createdAt: new Date(Date.now() - 86400000),
            },
        ];
    }

    /**
     * Delete a greeting
     */
    async deleteGreeting(id: string, tenantId?: string): Promise<void> {
        console.log(`[HelloService] Deleting greeting: ${id} for tenant: ${tenantId}`);
    }
}
