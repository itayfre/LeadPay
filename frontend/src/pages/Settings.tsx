import Layout from '../components/layout/Layout';

export default function Settings() {
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

        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <div className="text-6xl mb-4">⚙️</div>
          <h3 className="text-2xl font-bold text-gray-700 mb-3">הגדרות מערכת</h3>
          <p className="text-gray-600 max-w-md mx-auto">
            בקרוב: הגדרות שפה, התראות, ועוד
          </p>
        </div>
      </div>
    </Layout>
  );
}
