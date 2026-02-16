// API Types for LeadPay

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  bank_account_number?: string;
  total_tenants: number;
  expected_monthly_payment?: number;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  apartment_id: string;
  name: string;
  full_name?: string;
  phone?: string;
  email?: string;
  language: 'he' | 'en';
  ownership_type: 'בעלים' | 'משכיר' | 'שוכר';
  is_committee_member: boolean;
  has_standing_order: boolean;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentStatus {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  floor: number;
  expected_amount: number;
  paid_amount: number;
  difference: number;
  status: 'paid' | 'unpaid';
  is_overpaid: boolean;
  is_underpaid: boolean;
  phone?: string;
  language: 'he' | 'en';
}

export interface PaymentStatusResponse {
  building_id: string;
  building_name: string;
  period: string;
  summary: {
    total_tenants: number;
    paid: number;
    unpaid: number;
    total_expected: number;
    total_collected: number;
    collection_rate: string;
    amount_rate: string;
  };
  tenants: PaymentStatus[];
}

export interface WhatsAppMessage {
  message_id?: string;
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  phone: string;
  language: 'he' | 'en';
  message_type: string;
  amount_due: number;
  whatsapp_link: string;
  message_preview: string;
}

export interface MessageHistory {
  id: string;
  tenant_name: string;
  message_type: string;
  delivery_status: string;
  sent_at?: string;
  period?: string;
  message_preview: string;
}

export interface Transaction {
  id: string;
  activity_date: string;
  description: string;
  credit_amount?: number;
  debit_amount?: number;
  matched_tenant_id?: string;
  match_confidence?: number;
  match_method?: string;
  is_confirmed: boolean;
}

export interface BankStatement {
  id: string;
  filename: string;
  period: string;
  upload_date: string;
  transaction_count: number;
}
