import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, Component } from 'react';
import type { ReactNode } from 'react';
import './i18n';

import Buildings from './pages/Buildings';
import Dashboard from './pages/Dashboard';
import UploadStatement from './pages/UploadStatement';
import StatementsUpload from './pages/StatementsUpload';
import Map from './pages/Map';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import WhatsAppTemplates from './pages/WhatsAppTemplates';
import Layout from './components/layout/Layout';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000, // 30 seconds
    },
  },
});

// Error Boundary
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-xl shadow-lg border-2 border-red-200 p-8 max-w-lg w-full text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">שגיאה לא צפויה</h2>
            <p className="text-gray-600 mb-4">
              {this.state.error?.message || 'אירעה שגיאה בטעינת הדף'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/buildings';
              }}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
            >
              חזרה לדף הבית
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 404 Page
function NotFound() {
  return (
    <Layout>
      <div className="text-center py-16">
        <div className="text-8xl mb-4">🔍</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-3">404 - הדף לא נמצא</h2>
        <p className="text-gray-600 mb-6">הדף שחיפשת אינו קיים</p>
        <Link
          to="/buildings"
          className="inline-block px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </Layout>
  );
}

function App() {
  const { i18n } = useTranslation();

  // Set HTML direction based on language
  useEffect(() => {
    const dir = i18n.language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/buildings" replace />} />
            <Route path="/buildings" element={<Buildings />} />
            <Route path="/building/:buildingId" element={<Dashboard />} />
            <Route path="/building/:buildingId/upload" element={<UploadStatement />} />
            <Route path="/statements" element={<StatementsUpload />} />
            <Route path="/map" element={<Map />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/whatsapp-templates" element={<WhatsAppTemplates />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
