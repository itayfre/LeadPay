import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../services/api';

export default function Setup() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [formData, setFormData] = useState({ email: '', full_name: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Redirect if already logged in
  useEffect(() => {
    if (user) { navigate('/buildings'); return; }

    // Check if setup is still needed
    fetch(`${API_BASE_URL}/api/v1/auth/setup/status`)
      .then(r => r.json())
      .then(data => {
        if (!data.setup_needed) navigate('/login');
      })
      .catch(() => {}) // ignore network errors, let user try
      .finally(() => setChecking(false));
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    if (formData.password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          full_name: formData.full_name,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'שגיאה ביצירת החשבון');

      // Store tokens and redirect
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      window.location.href = '/buildings'; // hard reload so AuthContext picks up the new token
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-3">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">LeadPay</h1>
          <p className="text-gray-500 text-sm mt-1">הגדרה ראשונית</p>
        </div>

        {/* Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-sm text-blue-800 text-right">
          <strong>ברוך הבא!</strong> צור את חשבון המנהל הראשון. פעולה זו ניתנת לביצוע פעם אחת בלבד.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שם מלא</label>
            <input
              type="text"
              required
              placeholder="ישראל ישראלי"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.full_name}
              onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">כתובת אימייל</label>
            <input
              type="email"
              required
              placeholder="admin@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.email}
              onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">סיסמה (לפחות 8 תווים)</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.password}
              onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">אימות סיסמה</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.confirmPassword}
              onChange={e => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 text-right">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {loading ? 'יוצר חשבון...' : 'צור חשבון מנהל'}
          </button>
        </form>
      </div>
    </div>
  );
}
