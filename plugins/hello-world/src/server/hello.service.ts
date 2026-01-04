import { Inject, Injectable, Optional } from '@nestjs/common';
import type { PluginDatabaseCapability } from '@wordrhyme/plugin';

/**
 * Token for database capability injection
 */
export const PLUGIN_DATABASE = Symbol('PLUGIN_DATABASE');

/**
 * Hello World Service
 * 
 * Demonstrates NestJS Service pattern in a plugin.
 * Uses dependency injection and encapsulates business logic.
 * 
 * In Advanced Plugin mode, the database capability can be injected
 * for automatic table prefixing and tenant isolation.
 */
@Injectable()
export class HelloService {
    constructor(
        @Optional() @Inject(PLUGIN_DATABASE)
        private readonly db?: PluginDatabaseCapability
    ) { }

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
        metadata?: Record<string, unknown>
    ): Promise<{ id: string; name: string; message: string; createdAt: Date }> {
        const id = crypto.randomUUID();
        const createdAt = new Date();

        if (this.db) {
            // Use injected database capability (auto tenant isolation)
            await this.db.insert({
                table: 'greetings',
                data: {
                    id,
                    name,
                    message,
                    metadata: metadata ? JSON.stringify(metadata) : null,
                    created_at: createdAt.toISOString(),
                },
            });
            console.log(`[HelloService] Created greeting via db capability: ${id}`);
        } else {
            // Fallback: log mock creation
            console.log(`[HelloService] Mock creating greeting: ${name} - ${message}`);
        }

        return { id, name, message, createdAt };
    }

    /**
     * List all greetings
     */
    async listGreetings(limit = 10): Promise<Array<{
        id: string;
        name: string;
        message: string;
        createdAt: Date
    }>> {
        if (this.db) {
            // Use injected database capability (auto tenant filtering)
            const results = await this.db.query<{
                id: string;
                name: string;
                message: string;
                created_at: string;
            }>({
                table: 'greetings',
                limit,
            });

            return results.map(row => ({
                id: row.id,
                name: row.name,
                message: row.message,
                createdAt: new Date(row.created_at),
            }));
        }

        // Fallback: return mock data
        console.log(`[HelloService] Returning mock greetings (db not available)`);
        return [
            { id: '1', name: 'Alice', message: 'Hello from NestJS!', createdAt: new Date() },
            { id: '2', name: 'Bob', message: 'DI works!', createdAt: new Date(Date.now() - 86400000) },
        ];
    }

    /**
     * Delete a greeting
     */
    async deleteGreeting(id: string): Promise<void> {
        if (this.db) {
            await this.db.delete({
                table: 'greetings',
                where: { id },
            });
            console.log(`[HelloService] Deleted greeting: ${id}`);
        } else {
            console.log(`[HelloService] Mock deleting greeting: ${id}`);
        }
    }
}
