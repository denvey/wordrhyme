import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';

/**
 * tRPC Client Configuration
 *
 * Note: Using `any` for AppRouter type as a workaround for cross-package
 * type inference issues. In production, proper type sharing via a separate
 * types package would be ideal.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc = createTRPCReact<any>();

export const trpcClient = trpc.createClient({
    links: [
        httpBatchLink({
            url: '/trpc',
            // Include cookies for authentication
            fetch(url, options) {
                return fetch(url, {
                    ...options,
                    credentials: 'include',
                });
            },
        }),
    ],
});
