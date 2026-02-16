import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import './i18n';

import Buildings from './pages/Buildings';
import Dashboard from './pages/Dashboard';
import UploadStatement from './pages/UploadStatement';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

function App() {
  const { i18n } = useTranslation();

  // Set HTML direction based on language
  useEffect(() => {
    const dir = i18n.language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/buildings" replace />} />
          <Route path="/buildings" element={<Buildings />} />
          <Route path="/building/:buildingId" element={<Dashboard />} />
          <Route path="/building/:buildingId/upload" element={<UploadStatement />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
