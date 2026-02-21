import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import { buildingsAPI, statementsAPI } from '../services/api';

export default function StatementsUpload() {
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<any[]>([]);

  // Fetch all buildings
  const { data: buildings } = useQuery({
    queryKey: ['buildings'],
    queryFn: buildingsAPI.list,
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = async (files: FileList) => {
    if (!selectedBuilding) {
      alert('אנא בחר בניין לפני העלאת הקובץ');
      return;
    }

    setUploading(true);
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await statementsAPI.upload(selectedBuilding, file);
        results.push({ file: file.name, success: true, result });
      } catch (error) {
        results.push({ file: file.name, success: false, error: (error as Error).message });
      }
    }

    setUploadResults(results);
    setUploading(false);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-2xl shadow-lg p-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">העלאת דפי חשבון בנק</h1>
              <p className="text-indigo-100 text-lg">
                העלה דפי חשבון ממספר בניינים בו-זמנית
              </p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-6">
              <div className="text-5xl">📊</div>
            </div>
          </div>
        </div>

        {/* Building Selector */}
        <div className="bg-white rounded-xl shadow-md p-6 border border-gray-200">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            בחר בניין
          </label>
          <select
            value={selectedBuilding}
            onChange={(e) => setSelectedBuilding(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          >
            <option value="">-- בחר בניין --</option>
            {buildings?.map((building) => (
              <option key={building.id} value={building.id}>
                {building.name} - {building.address}, {building.city}
              </option>
            ))}
          </select>
        </div>

        {/* Upload Zone */}
        {selectedBuilding && (
          <div
            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${
              dragActive
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-300 bg-white hover:border-gray-400'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".xlsx,.xls,.pdf"
              multiple
              onChange={handleChange}
              disabled={uploading}
            />
            <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
              <div className="text-7xl mb-6">
                {uploading ? '⏳' : dragActive ? '📂' : '📄'}
              </div>
              <p className="text-xl font-semibold text-gray-700 mb-3">
                {uploading ? 'מעלה קבצים...' : dragActive ? 'שחרר כדי להעלות' : 'גרור קבצים לכאן'}
              </p>
              <p className="text-sm text-gray-500 mb-4">
                או לחץ לבחירת קבצים מהמחשב
              </p>
              <p className="text-xs text-gray-400">
                תומך בקבצי Excel (.xlsx, .xls) ו-PDF • ניתן להעלות מספר קבצים בו-זמנית
              </p>
            </label>
          </div>
        )}

        {/* Upload Results */}
        {uploadResults.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900">תוצאות העלאה</h3>
            <div className="space-y-3">
              {uploadResults.map((result, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-xl border-2 ${
                    result.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{result.success ? '✅' : '❌'}</span>
                        <h4 className="font-semibold text-gray-900">{result.file}</h4>
                      </div>
                      {result.success ? (
                        <div className="grid grid-cols-3 gap-4 mt-4">
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs text-gray-500">סה"כ עסקאות</p>
                            <p className="text-xl font-bold text-gray-900">
                              {result.result.total_transactions || 0}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs text-gray-500">הותאמו</p>
                            <p className="text-xl font-bold text-green-600">
                              {result.result.matched_count || 0}
                            </p>
                          </div>
                          <div className="bg-white rounded-lg p-3">
                            <p className="text-xs text-gray-500">לא הותאמו</p>
                            <p className="text-xl font-bold text-orange-600">
                              {result.result.unmatched_count || 0}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-red-600 mt-2">{result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setUploadResults([])}
              className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-colors"
            >
              העלה קבצים נוספים
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
          <h3 className="font-bold text-blue-900 text-lg mb-4 flex items-center gap-2">
            <span className="text-2xl">💡</span>
            הוראות שימוש
          </h3>
          <ul className="space-y-3 text-sm text-blue-800">
            <li className="flex items-start gap-3">
              <span className="text-lg">1️⃣</span>
              <span>בחר בניין מהרשימה</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">2️⃣</span>
              <span>גרור את דפי החשבון או לחץ לבחירת קבצים</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">3️⃣</span>
              <span>המערכת תנתח אוטומטית ותתאים תשלומים לדיירים</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-lg">4️⃣</span>
              <span>עבור לדשבורד של הבניין לצפייה בתוצאות</span>
            </li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
