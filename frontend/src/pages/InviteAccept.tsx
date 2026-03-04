import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface InviteData {
  email: string;
  full_name: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  manager: 'מנהל',
  worker: 'עובד',
  viewer: 'צופה',
  tenant: 'דייר',
};

const InviteAccept: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [formData, setFormData] = useState({ full_name: '', password: '', confirmPassword: '' });
  const [pageError, setPageError] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPageError('קישור לא תקף');
      setIsLoading(false);
      return;
    }
    fetch(`${API_BASE_URL}/api/v1/auth/invite/${token}`)
      .then(r => {
        if (!r.ok) throw new Error('הקישור לא תקף או שפג תוקפו');
        return r.json();
      })
      .then((data: InviteData) => {
        setInviteData(data);
        setFormData(prev => ({ ...prev, full_name: data.full_name }));
      })
      .catch(err => setPageError(err.message))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (formData.password !== formData.confirmPassword) {
      setFormError('הסיסמאות אינן תואמות');
      return;
    }
    if (formData.password.length < 8) {
      setFormError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: formData.full_name, password: formData.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'שגיאה בהגדרת החשבון');
      }
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      window.location.href = '/buildings';
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">קישור לא תקף</h2>
          <p className="text-red-600 mb-4">{pageError}</p>
          <a href="/login" className="text-primary-600 hover:underline">חזרה לדף הכניסה</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-primary-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white text-3xl">💰</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">הגדרת חשבון</h1>
          <p className="text-gray-500 mt-1 text-sm" dir="ltr">{inviteData?.email}</p>
          <span className="inline-block mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            {roleLabels[inviteData?.role ?? ''] ?? inviteData?.role}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סיסמה חדשה</label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
              placeholder="לפחות 8 תווים"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">אימות סיסמה</label>
            <input
              type="password"
              required
              value={formData.confirmPassword}
              onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
            />
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 text-white py-3 rounded-xl font-semibold hover:from-primary-700 hover:to-indigo-700 transition disabled:opacity-60 shadow-md"
          >
            {isSubmitting ? 'שומר...' : 'הגדר חשבון והיכנס'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default InviteAccept;
