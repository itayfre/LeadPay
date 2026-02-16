import type { Building, PaymentStatusResponse, WhatsAppMessage, BankStatement, Transaction } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Generic fetch wrapper
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Buildings API
export const buildingsAPI = {
  list: () => fetchAPI<Building[]>('/api/v1/buildings'),

  get: (id: string) => fetchAPI<Building>(`/api/v1/buildings/${id}`),

  create: (data: Omit<Building, 'id' | 'created_at' | 'updated_at'>) =>
    fetchAPI<Building>('/api/v1/buildings', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<Building>) =>
    fetchAPI<Building>(`/api/v1/buildings/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchAPI<void>(`/api/v1/buildings/${id}`, { method: 'DELETE' }),
};

// Payments API
export const paymentsAPI = {
  getStatus: (buildingId: string, month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());
    const query = params.toString() ? `?${params}` : '';
    return fetchAPI<PaymentStatusResponse>(`/api/v1/payments/${buildingId}/status${query}`);
  },

  getUnpaid: (buildingId: string, month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());
    const query = params.toString() ? `?${params}` : '';
    return fetchAPI<{ unpaid_tenants: any[] }>(`/api/v1/payments/${buildingId}/unpaid${query}`);
  },
};

// Statements API
export const statementsAPI = {
  upload: async (buildingId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/v1/statements/${buildingId}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(error.detail);
    }

    return response.json();
  },

  list: (buildingId: string) =>
    fetchAPI<{ statements: BankStatement[] }>(`/api/v1/statements/${buildingId}/statements`),

  getTransactions: (statementId: string) =>
    fetchAPI<{ transactions: Transaction[] }>(`/api/v1/statements/${statementId}/transactions`),
};

// Messages API
export const messagesAPI = {
  generateReminders: (buildingId: string, onlyUnpaid = true) => {
    const params = new URLSearchParams({ only_unpaid: onlyUnpaid.toString() });
    return fetchAPI<{ messages: WhatsAppMessage[] }>(
      `/api/v1/messages/${buildingId}/generate-reminders?${params}`,
      { method: 'POST' }
    );
  },

  markSent: (messageId: string) =>
    fetchAPI<void>(`/api/v1/messages/message/${messageId}/mark-sent`, { method: 'POST' }),

  getHistory: (buildingId: string) =>
    fetchAPI<{ messages: any[] }>(`/api/v1/messages/${buildingId}/history`),
};

// Tenants API
export const tenantsAPI = {
  import: async (buildingId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/v1/tenants/${buildingId}/import`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Import failed' }));
      throw new Error(error.detail);
    }

    return response.json();
  },
};
