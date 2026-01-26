/**
 * Logger Adapter Integration Tests
 *
 * Tests the dynamic logger adapter switching mechanism
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LoggerService } from '../../observability/logger.service';
import type { LoggerAdapter, LogContext } from '../../observability/types';

// Mock adapter for testing
class MockLoggerAdapter implements LoggerAdapter {
    public logs: Array<{ level: string; message: string; context?: LogContext }> = [];

    debug(message: string, context?: LogContext): void {
        this.logs.push({ level: 'debug', message, context });
    }

    info(message: string, context?: LogContext): void {
        this.logs.push({ level: 'info', message, context });
    }

    warn(message: string, context?: LogContext): void {
        this.logs.push({ level: 'warn', message, context });
    }

    error(message: string, context?: LogContext, trace?: string): void {
        this.logs.push({ level: 'error', message, context });
    }

    createChild(baseContext: LogContext): LoggerAdapter {
        const child = new MockLoggerAdapter();
        child.logs = this.logs; // Share logs with parent
        return child;
    }

    setMetadata(key: string, value: unknown): void {
        // Mock implementation
    }

    clearLogs(): void {
        this.logs = [];
    }
}

describe('Logger Adapter Integration', () => {
    let loggerService: LoggerService;
    let mockAdapter: MockLoggerAdapter;

    beforeAll(() => {
        loggerService = new LoggerService();
        mockAdapter = new MockLoggerAdapter();
    });

    afterAll(() => {
        mockAdapter.clearLogs();
    });

    it('should use default NestJS adapter on initialization', () => {
        const logger = new LoggerService();
        expect(logger).toBeDefined();
        // NestJS adapter should be used by default
    });

    it('should switch to new adapter dynamically', () => {
        // Switch to mock adapter
        loggerService.switchAdapter(mockAdapter);

        // Log a message
        loggerService.info('Test message', { testKey: 'testValue' });

        // Verify mock adapter received the log
        expect(mockAdapter.logs).toHaveLength(2); // 1 from switchAdapter, 1 from test
        expect(mockAdapter.logs[1]).toMatchObject({
            level: 'info',
            message: 'Test message',
            context: { testKey: 'testValue' },
        });
    });

    it('should log adapter switch event', () => {
        mockAdapter.clearLogs();

        const newMockAdapter = new MockLoggerAdapter();
        loggerService.switchAdapter(newMockAdapter);

        // Should log the switch event
        expect(newMockAdapter.logs).toHaveLength(1);
        expect(newMockAdapter.logs[0].message).toBe('Logger adapter switched');
    });

    it('should support all log levels', () => {
        mockAdapter.clearLogs();
        loggerService.switchAdapter(mockAdapter);

        loggerService.debug('Debug message');
        loggerService.info('Info message');
        loggerService.warn('Warn message');
        loggerService.error('Error message');

        expect(mockAdapter.logs).toHaveLength(5); // 1 switch + 4 logs
        expect(mockAdapter.logs[1].level).toBe('debug');
        expect(mockAdapter.logs[2].level).toBe('info');
        expect(mockAdapter.logs[3].level).toBe('warn');
        expect(mockAdapter.logs[4].level).toBe('error');
    });

    it('should respect log level filtering', () => {
        // Set LOG_LEVEL to 'warn' via environment
        process.env['LOG_LEVEL'] = 'warn';

        const filteredLogger = new LoggerService();
        const testAdapter = new MockLoggerAdapter();
        filteredLogger.switchAdapter(testAdapter);

        testAdapter.clearLogs();

        filteredLogger.debug('Should be filtered');
        filteredLogger.info('Should be filtered');
        filteredLogger.warn('Should pass');
        filteredLogger.error('Should pass');

        // Only warn and error should pass
        const actualLogs = testAdapter.logs.filter(log => log.message !== 'Logger adapter switched');
        expect(actualLogs).toHaveLength(2);
        expect(actualLogs[0].level).toBe('warn');
        expect(actualLogs[1].level).toBe('error');

        // Clean up
        delete process.env['LOG_LEVEL'];
    });

    it('should create child logger with base context', () => {
        mockAdapter.clearLogs();
        loggerService.switchAdapter(mockAdapter);

        const childLogger = loggerService.createChild({ service: 'UserService' });
        expect(childLogger).toBeDefined();
        expect(childLogger).toHaveProperty('info');
    });

    it('should handle context enrichment', () => {
        mockAdapter.clearLogs();
        loggerService.switchAdapter(mockAdapter);

        loggerService.info('Test with context', {
            userId: 'user-123',
            action: 'create',
        });

        const log = mockAdapter.logs.find(l => l.message === 'Test with context');
        expect(log).toBeDefined();
        expect(log?.context).toMatchObject({
            userId: 'user-123',
            action: 'create',
        });
    });
});

describe('Logger Adapter Plugin Loading Simulation', () => {
    it('should simulate plugin-provided adapter loading', () => {
        // Simulate what PluginManager does
        const logger = new LoggerService();
        const pluginAdapter = new MockLoggerAdapter();

        // Plugin provides a factory function
        const createLoggerAdapter = () => pluginAdapter;

        // PluginManager calls the factory and switches adapter
        const adapter = createLoggerAdapter();
        logger.switchAdapter(adapter);

        // Verify the switch was successful
        logger.info('Test from plugin adapter');
        expect(pluginAdapter.logs).toHaveLength(2); // 1 switch + 1 test
        expect(pluginAdapter.logs[1].message).toBe('Test from plugin adapter');
    });
});
