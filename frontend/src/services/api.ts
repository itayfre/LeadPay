import type { Building, BuildingPaymentSummary, Tenant, PaymentStatusResponse, WhatsAppMessage, BankStatement, Transaction, TenantPaymentHistory, ManualPaymentRequest, StatementReview } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const TOKEN_KEYS = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
} as const;

/** Injects the Bearer token from localStorage into every API request. */
function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEYS.ACCESS);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Generic fetch wrapper. Automatically omits Content-Type for FormData (lets browser set boundary).
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...getAuthHeaders(),
      ...options?.headers,
    },
    ...options,
  });

  if (response.status === 401) {
    // Token expired or invalid — redirect to login
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
    window.location.href = '/login';
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// Buildings API
export const buildingsAPI = {
  list: () => fetchAPI<Building[]>('/api/v1/buildings/'),

  get: (id: string) => fetchAPI<Building>(`/api/v1/buildings/${id}`),

  create: (data: Omit<Building, 'id' | 'created_at' | 'updated_at'>) =>
    fetchAPI<Building>('/api/v1/buildings/', {
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

  getBulkSummary: (month: number, year: number) =>
    fetchAPI<BuildingPaymentSummary[]>(
      `/api/v1/payments/bulk-summary?month=${month}&year=${year}`
    ),

  postManualPayment: (data: ManualPaymentRequest) =>
    fetchAPI<{ transaction_id: string; tenant_id: string; tenant_name: string; amount: number; month: number; year: number; description: string; is_manual: boolean }>(
      '/api/v1/payments/manual',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  getTenantHistory: (tenantId: string) =>
    fetchAPI<TenantPaymentHistory>(`/api/v1/payments/tenant/${tenantId}/history`),

  getTenantDebts: (buildingId: string) =>
    fetchAPI<Record<string, number>>(`/api/v1/payments/${buildingId}/tenant-debts`),
};

// Statements API
export const statementsAPI = {
  upload: (buildingId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchAPI<any>(`/api/v1/statements/${buildingId}/upload`, { method: 'POST', body: formData });
  },

  list: (buildingId: string) =>
    fetchAPI<{ statements: BankStatement[] }>(`/api/v1/statements/${buildingId}/statements`),

  getTransactions: (statementId: string) =>
    fetchAPI<{ transactions: Transaction[] }>(`/api/v1/statements/${statementId}/transactions`),

  getReview: (statementId: string) =>
    fetchAPI<StatementReview>(`/api/v1/statements/${statementId}/review`),

  manualMatch: (transactionId: string, tenantId: string) =>
    fetchAPI<any>(
      `/api/v1/statements/transactions/${transactionId}/match/${tenantId}`,
      { method: 'POST' }
    ),
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
};

// Tenants API
export const tenantsAPI = {
  import: (buildingId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetchAPI<any>(`/api/v1/tenants/${buildingId}/import`, { method: 'POST', body: formData });
  },

  list: (buildingId?: string) => {
    const query = buildingId ? `?building_id=${buildingId}` : '';
    return fetchAPI<Tenant[]>(`/api/v1/tenants/${query}`);
  },

  create: (data: {
    apartment_id: string;
    building_id: string;
    name: string;
    full_name?: string;
    ownership_type: string;
    phone?: string;
    email?: string;
    bank_name?: string;
    bank_account?: string;
    language?: string;
    has_standing_order?: boolean;
    is_active?: boolean;
  }) =>
    fetchAPI<Tenant>('/api/v1/tenants/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (tenantId: string, data: Partial<Tenant>) =>
    fetchAPI<Tenant>(`/api/v1/tenants/${tenantId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (tenantId: string) =>
    fetchAPI<void>(`/api/v1/tenants/${tenantId}`, { method: 'DELETE' }),

  resolveApartment: (buildingId: string, aptNumber: number, floor = 0) =>
    fetchAPI<{ apartment_id: string; apartment_number: number; floor: number }>(
      `/api/v1/tenants/${buildingId}/apartments/resolve`,
      {
        method: 'POST',
        body: JSON.stringify({ apt_number: aptNumber, floor }),
      }
    ),
};

// Apartments API
export const apartmentsAPI = {
  patch: (apartmentId: string, data: { expected_payment: number | null }) =>
    fetchAPI<{ apartment_id: string; expected_payment: number | null }>(
      `/api/v1/tenants/apartments/${apartmentId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      }
    ),
};
