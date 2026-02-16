import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Layout from '../components/layout/Layout';
import { buildingsAPI } from '../services/api';

// NOTE: User needs to add VITE_MAPBOX_TOKEN to .env file
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || '';

export default function Map() {
  const navigate = useNavigate();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data: buildings, isLoading } = useQuery({
    queryKey: ['buildings'],
    queryFn: buildingsAPI.list,
  });

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current || !MAPBOX_TOKEN) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [34.7818, 32.0853], // Tel Aviv center
      zoom: 11,
    });

    map.current.on('load', () => {
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  // Add markers for buildings
  useEffect(() => {
    if (!map.current || !mapReady || !buildings || buildings.length === 0) return;

    // For demo purposes, we'll use Tel Aviv coordinates since buildings don't have lat/long
    // In production, you'd need to geocode the addresses
    const demoCoordinates = [
      [34.7818, 32.0853],
      [34.7958, 32.0753],
      [34.7698, 32.0953],
      [34.8018, 32.0653],
    ];

    buildings.forEach((building, index) => {
      const coords = demoCoordinates[index % demoCoordinates.length];

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div class="p-2">
          <h3 class="font-bold text-sm mb-1">${building.name}</h3>
          <p class="text-xs text-gray-600">${building.address}, ${building.city}</p>
          <p class="text-xs text-gray-500 mt-1">${building.total_tenants || 0} דיירים</p>
        </div>
      `);

      // Create marker
      const el = document.createElement('div');
      el.className = 'building-marker';
      el.style.width = '40px';
      el.style.height = '40px';
      el.style.backgroundImage = 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0iIzI1NjNlYiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSI0Ii8+PHRleHQgeD0iMjAiIHk9IjI2IiBmb250LXNpemU9IjIwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSJ3aGl0ZSI+8J+PojwvdGV4dD48L3N2Zz4=)';
      el.style.backgroundSize = 'contain';
      el.style.cursor = 'pointer';

      el.addEventListener('click', () => {
        navigate(`/building/${building.id}`);
      });

      new mapboxgl.Marker(el)
        .setLngLat([coords[0], coords[1]])
        .setPopup(popup)
        .addTo(map.current!);
    });
  }, [mapReady, buildings, navigate]);

  if (!MAPBOX_TOKEN) {
    return (
      <Layout>
        <div className="space-y-8">
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

          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-8 text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">נדרש Mapbox Token</h3>
            <p className="text-gray-700 mb-6 max-w-2xl mx-auto">
              כדי להשתמש במפה, הוסף <code className="bg-yellow-100 px-2 py-1 rounded">VITE_MAPBOX_TOKEN</code> לקובץ <code className="bg-yellow-100 px-2 py-1 rounded">.env</code> בתיקיית frontend
            </p>
            <div className="bg-white rounded-lg p-4 text-right max-w-2xl mx-auto">
              <p className="text-sm font-semibold text-gray-900 mb-2">📝 הוראות:</p>
              <ol className="text-sm text-gray-700 space-y-2">
                <li>1. הירשם ל-Mapbox בחינם: <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">mapbox.com</a></li>
                <li>2. קבל את ה-Access Token שלך</li>
                <li>3. הוסף לקובץ .env: <code className="bg-gray-100 px-2 py-1 rounded">VITE_MAPBOX_TOKEN=your_token_here</code></li>
                <li>4. הפעל מחדש את שרת הפיתוח</li>
              </ol>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

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

        {/* Map */}
        <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
          <div ref={mapContainer} className="h-[600px]" />
        </div>

        {/* Buildings List */}
        {!isLoading && buildings && buildings.length > 0 && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">רשימת בניינים</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {buildings.map((building) => (
                <div
                  key={building.id}
                  onClick={() => navigate(`/building/${building.id}`)}
                  className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-primary-300 transition-colors cursor-pointer"
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
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Center map on building (would need geocoding in production)
                    }}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    הצג במפה
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note about demo coordinates */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <span className="text-2xl">ℹ️</span>
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-2">הערה למפתחים:</p>
              <p>המפה משתמשת בקו אורדינטות דמו באזור תל אביב. לייצור, יש להוסיף:</p>
              <ul className="list-disc mr-5 mt-2 space-y-1">
                <li>שדות latitude ו-longitude למודל Building</li>
                <li>שירות Geocoding (Google Maps, Mapbox, או Nominatim)</li>
                <li>המרת כתובות לקואורדינטות בעת יצירת בניין</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
