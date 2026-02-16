import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Layout from '../components/layout/Layout';
import { statementsAPI } from '../services/api';

export default function UploadStatement() {
  const { t } = useTranslation();
  const { buildingId } = useParams<{ buildingId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const handleFile = async (file: File) => {
    if (!buildingId) return;

    // Check file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(xlsx?|pdf)$/i)) {
      setError('קובץ לא נתמך. אנא העלה קובץ Excel או PDF');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const result = await statementsAPI.upload(buildingId, file);
      setUploadResult(result);

      // Invalidate payment status query to refresh the dashboard
      queryClient.invalidateQueries({ queryKey: ['paymentStatus', buildingId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (!buildingId) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-red-600">{t('common.error')}: Missing building ID</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate(`/building/${buildingId}`)}
            className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-1"
          >
            ← חזור לדשבורד
          </button>
          <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.uploadStatement')}</h2>
          <p className="text-sm text-gray-500 mt-1">
            העלה דף חשבון בנק מהבנק שלך (Excel או PDF)
          </p>
        </div>

        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
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
            onChange={handleChange}
            disabled={uploading}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <div className="text-6xl mb-4">
              {uploading ? '⏳' : dragActive ? '📂' : '📄'}
            </div>
            <p className="text-lg font-medium text-gray-700 mb-2">
              {uploading
                ? t('upload.uploading')
                : dragActive
                ? 'שחרר כדי להעלות'
                : t('upload.dragDrop')}
            </p>
            <p className="text-sm text-gray-500">
              תומך בקבצי Excel (.xlsx, .xls) ו-PDF
            </p>
          </label>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">❌</span>
              <div>
                <p className="font-medium text-red-800">{t('upload.error')}</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success Result */}
        {uploadResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-3xl">✅</span>
              <div>
                <p className="font-bold text-green-800 text-lg">{t('upload.success')}</p>
                <p className="text-sm text-green-600">
                  הדף חשבון עובד בהצלחה והתשלומים עודכנו
                </p>
              </div>
            </div>

            {/* Upload Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-green-200">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-800">
                  {uploadResult.total_transactions || 0}
                </p>
                <p className="text-sm text-green-600">עסקאות סה"כ</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-800">
                  {uploadResult.matched_count || 0}
                </p>
                <p className="text-sm text-green-600">התאמות אוטומטיות</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-800">
                  {uploadResult.unmatched_count || 0}
                </p>
                <p className="text-sm text-green-600">טעון התאמה ידנית</p>
              </div>
            </div>

            {/* Unmatched Transactions */}
            {uploadResult.unmatched_transactions &&
              uploadResult.unmatched_transactions.length > 0 && (
                <div className="pt-4 border-t border-green-200">
                  <p className="font-medium text-green-800 mb-3">
                    עסקאות שטעונות התאמה ידנית:
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {uploadResult.unmatched_transactions.map((tx: any, index: number) => (
                      <div
                        key={index}
                        className="bg-white rounded border border-green-300 p-3 text-sm"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">
                              {tx.payer_name || 'לא זוהה'}
                            </p>
                            <p className="text-gray-500 text-xs">
                              {new Date(tx.transaction_date).toLocaleDateString('he-IL')}
                            </p>
                          </div>
                          <p className="font-bold text-green-700">
                            ₪{tx.amount?.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => navigate(`/building/${buildingId}`)}
                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                צפה בדשבורד המעודכן
              </button>
              <button
                onClick={() => {
                  setUploadResult(null);
                  setError(null);
                }}
                className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                העלה דף חשבון נוסף
              </button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!uploadResult && !error && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-bold text-blue-900 mb-3">💡 הוראות שימוש</h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span>1️⃣</span>
                <span>הורד את דף החשבון מהאתר של הבנק שלך (Excel או PDF)</span>
              </li>
              <li className="flex items-start gap-2">
                <span>2️⃣</span>
                <span>גרור את הקובץ לאזור ההעלאה או לחץ לבחירת קובץ</span>
              </li>
              <li className="flex items-start gap-2">
                <span>3️⃣</span>
                <span>המערכת תנתח אוטומטית את העסקאות ותתאים לדיירים</span>
              </li>
              <li className="flex items-start gap-2">
                <span>4️⃣</span>
                <span>עסקאות שלא הותאמו אוטומטית תוכל להתאים באופן ידני</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
}
