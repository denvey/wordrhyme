import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ContextMiddleware } from './context.middleware';

/**
 * Context Module
 *
 * Provides AsyncLocalStorage-based request context.
 */
@Module({
    providers: [],
    exports: [],
})
export class ContextModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(ContextMiddleware).forRoutes('*');
    }
}
