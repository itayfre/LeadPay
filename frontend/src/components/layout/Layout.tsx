import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(newLang);
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/buildings" className="flex items-center space-x-2 rtl:space-x-reverse">
              <div className="text-2xl font-bold text-blue-600">💰</div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('app.title')}</h1>
                <p className="text-xs text-gray-500">{t('app.subtitle')}</p>
              </div>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center space-x-4 rtl:space-x-reverse">
              <Link
                to="/buildings"
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive('/buildings')
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t('nav.buildings')}
              </Link>

              {/* Language Toggle */}
              <button
                onClick={toggleLanguage}
                className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Toggle language"
              >
                {i18n.language === 'he' ? '🇬🇧 EN' : '🇮🇱 עב'}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
