import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AUTH_KEY } from './account/api';
import { AuthGate } from './account/AuthGate';
import { isAuthError } from './api';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// A request that finds the session gone (expired, signed out elsewhere, or the account
// disabled) rechecks who's signed in, which brings back the sign-in screen.
const onError = (err: unknown) => {
  if (isAuthError(err)) void queryClient.invalidateQueries({ queryKey: AUTH_KEY });
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      retry: (count, err) => !isAuthError(err) && count < 1,
      // Coming back to the app picks up what others added meanwhile. The map data is cached for
      // the session (staleTime: Infinity), so this refetches only the shared notebook and markers.
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <App />
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
);
