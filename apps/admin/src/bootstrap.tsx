import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { trpc, trpcClient } from './lib/trpc';
import { AuthProvider } from './lib/auth';
import { __setTrpc } from '@wordrhyme/plugin/react';
import { AbilityProvider } from './lib/ability';
import { CurrencyProvider } from './lib/currency';
import { I18nProvider } from './lib/i18n';
import { App } from './App';
import { Toaster } from './components/Toaster';
import './index.css';

// Initialize theme from localStorage
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
}

// Inject host tRPC into plugin runtime
__setTrpc(trpc);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <BrowserRouter>
                    <AuthProvider>
                        <AbilityProvider>
                            <I18nProvider>
                                <CurrencyProvider>
                                    <App />
                                    <Toaster />
                                </CurrencyProvider>
                            </I18nProvider>
                        </AbilityProvider>
                    </AuthProvider>
                </BrowserRouter>
            </QueryClientProvider>
        </trpc.Provider>
    </React.StrictMode>,
);

