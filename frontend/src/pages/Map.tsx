import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import { buildingsAPI } from '../services/api';

export default function Map() {
  const { data: buildings, isLoading } = useQuery({
    queryKey: ['buildings'],
    queryFn: buildingsAPI.list,
  });

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-green-600 to-teal-700 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">מפת בניינים</h1>
              <p className="text-green-100 text-lg">
                {buildings?.length || 0} מיקומים על המפה
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">🗺️</div>
            </div>
          </div>
        </div>

        {/* Map Placeholder */}
        <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
          <div className="relative h-[600px] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <div className="text-center p-8">
              <div className="text-6xl mb-4">🗺️</div>
              <h3 className="text-2xl font-bold text-gray-700 mb-3">מפה אינטראקטיבית</h3>
              <p className="text-gray-600 mb-6 max-w-md">
                בקרוב: תוכל לראות את כל הבניינים שלך על מפה אינטראקטיבית
              </p>
              <p className="text-sm text-gray-500">
                נשתמש ב-Google Maps API או Mapbox לתצוגת מיקומים
              </p>
            </div>
          </div>
        </div>

        {/* Buildings List */}
        {!isLoading && buildings && buildings.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">רשימת בניינים</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {buildings.map((building) => (
                <div
                  key={building.id}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors"
                >
                  <div className="bg-primary-100 rounded-lg p-3">
                    <span className="text-2xl">📍</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{building.name}</h4>
                    <p className="text-sm text-gray-600">
                      {building.address}, {building.city}
                    </p>
                  </div>
                  <button className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors">
                    הצג במפה
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
