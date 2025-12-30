import { Module, Global } from '@nestjs/common';
import { db } from './client';

/**
 * Database Module
 *
 * Provides Drizzle ORM instance to all modules.
 */
@Global()
@Module({
    providers: [
        {
            provide: 'DATABASE',
            useValue: db,
        },
    ],
    exports: ['DATABASE'],
})
export class DatabaseModule { }
