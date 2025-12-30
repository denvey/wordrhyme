import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { trpc, trpcClient } from './lib/trpc';
import { AuthProvider } from './lib/auth';
import { App } from './App';
import { Toaster } from './components/Toaster';
import './index.css';

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <AuthProvider>
                        <App />
                        <Toaster />
                    </AuthProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </trpc.Provider>
    </React.StrictMode>,
);

