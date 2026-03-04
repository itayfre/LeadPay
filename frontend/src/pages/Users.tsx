import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AppUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  building_id?: string | null;
  created_at?: string;
}

interface Building {
  id: string;
  name: string;
}

interface InviteForm {
  email: string;
  full_name: string;
  role: string;
  building_id: string;
}

const roleLabels: Record<string, string> = {
  manager: 'מנהל',
  worker: 'עובד',
  viewer: 'צופה',
  tenant: 'דייר',
};

const statusLabels: Record<string, string> = {
  active: 'פעיל',
  pending: 'ממתין לאישור',
  invited: 'הוזמן',
};

const roleBadgeColors: Record<string, string> = {
  manager: 'bg-purple-100 text-purple-700',
  worker: 'bg-blue-100 text-blue-700',
  viewer: 'bg-gray-100 text-gray-600',
  tenant: 'bg-green-100 text-green-700',
};

const statusBadgeColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  pending: 'bg-yellow-100 text-yellow-700',
  invited: 'bg-blue-100 text-blue-700',
};

const Users: React.FC = () => {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: '',
    full_name: '',
    role: 'viewer',
    building_id: '',
  });
  const [inviteResult, setInviteResult] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);

  const authHeaders = {
    'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`,
    'Content-Type': 'application/json',
  };

  const { data: users = [], isLoading } = useQuery<AppUser[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load users');
      return res.json();
    },
  });

  const { data: buildings = [] } = useQuery<Building[]>({
    queryKey: ['buildings-simple'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/v1/buildings/`, { headers: authHeaders });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/approve`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to approve');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteResult('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users/invite`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          email: inviteForm.email,
          full_name: inviteForm.full_name,
          role: inviteForm.role,
          building_id: inviteForm.building_id || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error');
      }
      const data = await res.json();
      setInviteResult(data.invite_url);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setInviteForm({ email: '', full_name: '', role: 'viewer', building_id: '' });
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'שגיאה');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteResult('');
    setInviteError('');
    setInviteForm({ email: '', full_name: '', role: 'viewer', building_id: '' });
  };

  const pendingUsers = users.filter(u => u.status === 'pending');
  const displayUsers = activeTab === 'pending' ? pendingUsers : users;

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ניהול משתמשים</h1>
          <p className="text-gray-500 text-sm mt-0.5">הוסף ונהל את משתמשי המערכת</p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="bg-gradient-to-r from-primary-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:from-primary-700 hover:to-indigo-700 transition shadow-md text-sm"
        >
          + הזמן משתמש
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'pending'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab === 'all'
              ? `כל המשתמשים (${users.length})`
              : `ממתינים לאישור`}
            {tab === 'pending' && pendingUsers.length > 0 && (
              <span className="mr-1.5 inline-flex items-center justify-center bg-red-500 text-white text-xs rounded-full w-4 h-4 font-bold">
                {pendingUsers.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          </div>
        ) : displayUsers.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <div className="text-4xl mb-3">👥</div>
            <p>{activeTab === 'pending' ? 'אין משתמשים הממתינים לאישור' : 'אין משתמשים במערכת'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">שם</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">אימייל</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">תפקיד</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">סטטוס</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {displayUsers.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 transition ${u.id === currentUser?.id ? 'bg-blue-50/30' : ''}`}>
                  <td className="px-5 py-3.5 font-medium text-gray-900">
                    {u.full_name}
                    {u.id === currentUser?.id && (
                      <span className="mr-2 text-xs text-gray-400">(אתה)</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-sm" dir="ltr">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleBadgeColors[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {roleLabels[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeColors[u.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[u.status] ?? u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {u.status === 'pending' && (
                        <button
                          onClick={() => approveMutation.mutate(u.id)}
                          disabled={approveMutation.isPending}
                          className="text-xs bg-green-100 text-green-700 hover:bg-green-200 px-3 py-1.5 rounded-lg transition font-medium"
                        >
                          ✓ אשר
                        </button>
                      )}
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => {
                            if (window.confirm(`האם למחוק את המשתמש "${u.full_name}"?`)) {
                              deleteMutation.mutate(u.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg transition font-medium"
                        >
                          מחק
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          dir="rtl"
          onClick={e => { if (e.target === e.currentTarget) closeInviteModal(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-gray-900">הזמן משתמש חדש</h2>
              <button
                onClick={closeInviteModal}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {inviteResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-green-700 bg-green-50 rounded-xl p-3">
                  <span className="text-xl">✅</span>
                  <span className="font-medium text-sm">ההזמנה נוצרה בהצלחה!</span>
                </div>
                <p className="text-sm text-gray-600">שלח את הקישור הבא למשתמש (תקף ל-7 ימים):</p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs break-all font-mono text-gray-700" dir="ltr">
                  {inviteResult}
                </div>
                <button
                  onClick={() => copyToClipboard(inviteResult)}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition ${copied ? 'bg-green-100 text-green-700' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'}`}
                >
                  {copied ? '✓ הועתק!' : '📋 העתק קישור'}
                </button>
                <button
                  onClick={closeInviteModal}
                  className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  סגור
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">שם מלא</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.full_name}
                    onChange={e => setInviteForm(p => ({ ...p, full_name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-right"
                    placeholder="ישראל ישראלי"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">אימייל</label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    dir="ltr"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">תפקיד</label>
                  <select
                    value={inviteForm.role}
                    onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="worker">עובד – יכול לצפות ולערוך</option>
                    <option value="viewer">צופה – יכול לצפות בלבד</option>
                    <option value="tenant">דייר – רואה בניין שלו בלבד</option>
                    <option value="manager">מנהל – גישה מלאה</option>
                  </select>
                </div>

                {(inviteForm.role === 'tenant') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">בניין (לדיירים)</label>
                    <select
                      value={inviteForm.building_id}
                      onChange={e => setInviteForm(p => ({ ...p, building_id: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">-- בחר בניין --</option>
                      {buildings.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {inviteError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-sm">
                    {inviteError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary-600 to-indigo-600 text-white py-2.5 rounded-xl font-semibold hover:from-primary-700 hover:to-indigo-700 transition shadow-md"
                >
                  צור קישור הזמנה
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;
