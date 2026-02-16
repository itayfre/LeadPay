import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { tenantsAPI } from '../services/api';

interface TenantImportProps {
  buildingId: string;
  buildingName: string;
}

export default function TenantImport({ buildingId, buildingName }: TenantImportProps) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await tenantsAPI.import(buildingId, file);
      setResult(response);
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
      queryClient.invalidateQueries({ queryKey: ['building', buildingId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-8">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <span className="text-4xl">👥</span>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          אין דיירים ב{buildingName}
        </h3>
        <p className="text-gray-600 max-w-md mx-auto">
          העלה קובץ Excel עם פרטי הדיירים כדי להתחיל לעקוב אחר תשלומים
        </p>
      </div>

      {/* Upload Button */}
      <div className="flex justify-center">
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>{uploading ? 'מעלה...' : 'העלה קובץ דיירים'}</span>
          </div>
        </label>
      </div>

      {/* Success Result */}
      {result && (
        <div className="mt-6 bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">✅</span>
            <div>
              <p className="font-bold text-green-800">הצלחה!</p>
              <p className="text-sm text-green-600">
                {result.imported_count || 0} דיירים נוספו בהצלחה
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-6 bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">❌</span>
            <div>
              <p className="font-bold text-red-800">שגיאה</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 pt-6 border-t-2 border-blue-200">
        <p className="text-sm font-semibold text-blue-900 mb-3">📋 פורמט הקובץ:</p>
        <div className="bg-white rounded-lg p-4 text-sm text-gray-700 space-y-2">
          <p>• <strong>עמודות נדרשות:</strong> שם מלא, מספר דירה, טלפון</p>
          <p>• <strong>עמודות אופציונליות:</strong> סוג בעלות, תשלום צפוי, שפה</p>
          <p>• <strong>פורמט טלפון:</strong> 0501234567 או 972501234567</p>
        </div>
      </div>
    </div>
  );
}
