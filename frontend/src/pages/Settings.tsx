import { useNavigate } from 'react-router-dom';
import Layout from '../components/layout/Layout';

export default function Settings() {
  const navigate = useNavigate();

  const settingsItems = [
    {
      icon: '💬',
      title: 'תבניות WhatsApp',
      description: 'ערוך את תבניות ההודעות שנשלחות לדיירים',
      color: 'from-purple-500 to-pink-600',
      path: '/whatsapp-templates',
    },
    {
      icon: '🌐',
      title: 'שפה ואזור',
      description: 'בחר שפה ואזור זמן',
      color: 'from-blue-500 to-cyan-600',
      path: null,
    },
    {
      icon: '🔔',
      title: 'התראות',
      description: 'נהל התראות ותזכורות',
      color: 'from-orange-500 to-red-600',
      path: null,
    },
    {
      icon: '👤',
      title: 'פרופיל משתמש',
      description: 'ערוך פרטים אישיים',
      color: 'from-green-500 to-teal-600',
      path: null,
    },
  ];

  return (
    <Layout>
      <div className="space-y-8">
        <div className="bg-gradient-to-r from-gray-700 to-gray-900 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">הגדרות</h1>
              <p className="text-gray-300 text-lg">
                הגדרות מערכת ואישיות
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">⚙️</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {settingsItems.map((item, index) => (
            <div
              key={index}
              onClick={() => item.path && navigate(item.path)}
              className={`bg-white rounded-xl shadow-md border-2 border-gray-200 overflow-hidden hover:shadow-xl transition-all ${
                item.path ? 'cursor-pointer hover:border-primary-300' : 'opacity-60'
              }`}
            >
              <div className={`bg-gradient-to-r ${item.color} p-6 text-white`}>
                <div className="flex items-center gap-4">
                  <div className="text-5xl">{item.icon}</div>
                  <div>
                    <h3 className="text-xl font-bold">{item.title}</h3>
                    <p className="text-sm opacity-90">{item.description}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-gray-50">
                {item.path ? (
                  <button className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors">
                    פתח →
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full px-4 py-2 bg-gray-300 text-gray-500 font-medium rounded-lg cursor-not-allowed"
                  >
                    בקרוב
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
