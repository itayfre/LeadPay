// API Types for LeadPay

export interface Building {
  id: string;
  name: string;
  address: string;
  city: string;
  bank_account_number?: string;
  total_tenants: number;
  expected_monthly_payment?: number;
  total_expected_monthly?: number;  // computed sum of active tenant expected payments
  created_at: string;
  updated_at: string;
}

export interface BuildingPaymentSummary {
  building_id: string;
  paid: number;
  partial?: number;
  unpaid: number;
  total_tenants: number;
  collection_rate: number;      // 0–100
  total_collected: number;
  total_expected?: number;       // sum of active tenants' expected payments for the period
}

// ---- Stage 1 backend additions ----

export interface PortfolioTrendBuilding {
  building_id: string;
  name: string;
  collected: number;
  expected: number;
  rate: number;                  // 0–100+ (can exceed 100% on overpayment)
}

export interface PortfolioTrendMonth {
  period: string;                // 'YYYY-MM'
  month: number;                 // 1–12
  year: number;
  portfolio_collected: number;
  portfolio_expected: number;
  buildings: PortfolioTrendBuilding[];
}

export interface ExpenseCategory {
  id: string;
  building_id: string;
  name: string;
  color: string;                 // '#RRGGBB'
  is_default: boolean;
  is_active: boolean;
}

// New per-building expense row (distinct from the upload-review `ExpenseRow` above).
export interface Expense {
  transaction_id: string;
  allocation_id: string;
  date: string;                  // 'YYYY-MM-DD'
  amount: number;
  description: string;
  vendor_label: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
}

export interface BuildingSummaryStats {
  kpis: {
    avg_collection_rate: number;
    open_ar: number;
    avg_days_to_pay: number;
    income: number;
    expenses: number;
  };
  trend: { period: string; rate: number; collected: number; expected: number }[];
  expenses_by_category: {
    category_id: string | null;
    name: string;
    color: string;
    amount: number;
  }[];
  debt_aging: {
    '0-7': number;
    '8-30': number;
    '31-60': number;
    '60+': number;
    unpaid: number;
  };
  worst_payers: {
    tenant_id: string;
    name: string;
    apartment_number: number;
    rate: number;
    debt: number;
  }[];
}

export interface Tenant {
  id: string;
  apartment_id: string;
  building_id: string;        // direct building FK
  building_name?: string;     // joined from building (returned by list endpoint)
  name: string;
  full_name?: string;
  phone?: string;
  email?: string;
  language: 'he' | 'en';
  ownership_type?: 'בעלים' | 'משכיר' | 'שוכר' | null;
  is_committee_member: boolean;
  has_standing_order: boolean;
  bank_name?: string;
  bank_account?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined from apartment (returned by list endpoint)
  apartment_number?: number;
  floor?: number;
  expected_payment?: number | null;           // per-apartment override (null = not set)
  building_expected_payment?: number | null;  // building default (for display fallback)
  move_in_date?: string;   // ISO date, default "2026-01-01"
}

export interface PaymentStatus {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  floor: number;
  expected_amount: number;
  paid_amount: number;
  difference: number;
  status: 'paid' | 'partial' | 'unpaid';
  is_overpaid: boolean;
  is_underpaid: boolean;
  phone?: string;
  language: 'he' | 'en';
  apartment_id: string;
  move_in_date: string;   // ISO date "2026-01-01"
  total_debt: number;
}

export interface PaymentStatusResponse {
  building_id: string;
  building_name: string;
  period: string;
  summary: {
    total_tenants: number;
    paid: number;
    partial: number;
    unpaid: number;
    total_expected: number;
    total_collected: number;
    collection_rate: string;
    amount_rate: string;
  };
  tenants: PaymentStatus[];
}

export interface TenantTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  is_manual: boolean;
}

export interface TenantPaymentHistoryMonth {
  month: number;
  year: number;
  period: string;
  expected: number;
  paid: number;
  difference: number;
  status: 'paid' | 'partial' | 'unpaid';
  transactions: TenantTransaction[];
}

export interface TenantPaymentHistory {
  tenant_id: string;
  tenant_name: string;
  apartment_number: number;
  move_in_date: string | null;
  months: TenantPaymentHistoryMonth[];
}

export interface ManualPaymentRequest {
  building_id: string;
  tenant_id: string;
  amount: number;
  month: number;
  year: number;
  note?: string;
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

// --- Upload Review Modal types ---

export interface MatchSuggestion {
  tenant_id: string;
  tenant_name: string;
  score: number;
}

export interface ReviewTransaction {
  id: string;
  activity_date: string;
  description: string;
  payer_name?: string;
  credit_amount?: number;
  debit_amount?: number;
  transaction_type: string;
  // matched only:
  tenant_id?: string;
  tenant_name?: string;
  match_confidence?: number;
  match_method?: string;
  is_confirmed?: boolean;
  allocations?: Allocation[];
  // unmatched only:
  suggestions?: MatchSuggestion[];
  is_from_current_statement?: boolean;
  source_period_label?: string | null;
}

export interface ExpenseRow {
  id: string;
  activity_date: string;
  description: string;
  debit_amount?: number;
  transaction_type: string;
  // classifier output (null if uncategorized)
  vendor_label: string | null;
  category: string | null;
  allocation_id: string | null;
}

export interface StatementReview {
  statement_id: string;
  period: string;
  matched: ReviewTransaction[];
  unmatched: ReviewTransaction[];
  irrelevant: ReviewTransaction[];
  expenses: ExpenseRow[];
  all_tenants: MatchSuggestion[];
}

// --- Allocation types (PR-3) ---

export interface Allocation {
  id: string;
  transaction_id: string;
  tenant_id?: string;
  label?: string;
  amount: number;
  period_month?: number;
  period_year?: number;
  category?: string;
  notes?: string;
  created_at: string;
}

export interface AllocationItem {
  tenant_id?: string;
  label?: string;
  amount: number;
  period_month?: number;
  period_year?: number;
}

export interface SetAllocationsRequest {
  allocations: AllocationItem[];
}

export type AllocationMode = 'split' | 'multi_month' | 'non_tenant';

export interface UploadResult {
  statement_id: string;
  period: string;
  total_transactions: number;
  payment_transactions: number;
  matched: number;
  unmatched: number;
  skipped_duplicates: number;
  match_rate: string;
  duplicate_warning?: string | null;
}
