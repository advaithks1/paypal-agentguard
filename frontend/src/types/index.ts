/** Shared domain types. Mirror docs/API_CONTRACT.md. Money is a number in major units (e.g. 12.50). */

export type DataSource = 'demo' | 'backend' | 'paypal_sandbox' | 'paypal_live';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'INR' | 'CAD' | 'AUD';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type RiskCategory = 'low' | 'medium' | 'high' | 'critical';
export type PolicyDecision = 'auto_approved' | 'needs_approval' | 'blocked';
export type RequestStatus = 'submitted' | 'evaluating' | 'pending_approval' | 'approved' | 'rejected' | 'blocked' | 'paid' | 'failed';
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';
export type PaymentStatus = 'not_started' | 'order_created' | 'buyer_approved' | 'authorized' | 'partially_captured' | 'captured' | 'failed' | 'refunded' | 'voided' | 'expired';
export type MerchantStatus = 'trusted' | 'restricted' | 'unreviewed';
export type ExplanationSource = 'gemini' | 'rule_based';

export interface User { id: string; email: string; full_name: string; created_at: string }
export interface LoginRequest { email: string; password: string }
export interface RegisterRequest extends LoginRequest { full_name: string }
export interface AuthResponse { access_token: string; token_type: 'bearer'; user: User }

export interface RiskFactor { code: string; label: string; weight: number; detail: string }
export interface PolicyViolation { rule: string; message: string; severity: 'info' | 'warning' | 'blocking' }

export interface RiskAssessment {
  score: number; // 0-100
  category: RiskCategory;
  factors: RiskFactor[];
  explanation: string | null;
  /** Who wrote `explanation`. 'rule_based' text must be labelled as such in the UI. Absent on demo records. */
  explanation_source?: ExplanationSource;
  source: DataSource; // 'demo' until produced by the backend
  generated_at: string;
}
export interface PolicyEvaluation {
  decision: PolicyDecision;
  violations: PolicyViolation[];
  evaluated_at: string;
  source: DataSource;
}

export interface PurchaseRequestCreate {
  item: string; merchant: string; amount: number; currency: Currency;
  description: string; reason: string; priority: Priority;
}
export interface PurchaseRequest extends PurchaseRequestCreate {
  id: string;
  agent_name: string | null;
  status: RequestStatus;
  policy_evaluation: PolicyEvaluation | null;
  risk_assessment: RiskAssessment | null;
  approval_status: ApprovalStatus;
  payment_status: PaymentStatus;
  ai_explanation: string | null;
  source_prompt?: string | null;
  created_at: string;
  data_source: DataSource;
}

export interface SpendingPolicy {
  max_auto_amount: number;
  max_transaction_amount: number;
  daily_limit: number;
  manual_approval_threshold: number;
  allowed_currencies: Currency[];
  approved_merchants: string[];
  restricted_merchants: string[];
  duplicate_protection: boolean;
  duplicate_window_minutes: number;
  updated_at: string | null;
}

export interface Approval {
  id: string;
  purchase_request: PurchaseRequest;
  status: ApprovalStatus;
  decided_at: string | null;
  decision_note: string | null;
}

export interface Transaction {
  id: string;
  purchase_request_id: string | null;
  merchant: string;
  amount: number;
  currency: Currency;
  risk_score: number;
  risk_category: RiskCategory;
  policy_decision: PolicyDecision;
  payment_status: PaymentStatus;
  paypal_order_id: string | null; // always null for demo data
  created_at: string;
  data_source: DataSource;
}

export interface Payment {
  id: string;
  purchase_request_id: string;
  paypal_order_id: string | null;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  approval_url: string | null;
  captured_at: string | null;
  data_source: DataSource;
  intent: 'authorize' | 'capture';
  authorization_id: string | null;
  authorization_expires_at: string | null;
  expires_in_seconds: number | null;
  expiring_soon: boolean;
  funds_held: boolean;
  captured_amount: number;
  remaining_authorized: number;
  hold_explanation: string | null;
  hold_explanation_source: 'gemini' | 'rule_based' | null;
  autonomous?: boolean;
  agent_name?: string | null;
}
export interface WalletGuardrails { agent_name: string; daily_cap: number; per_transaction_cap: number; allowed_merchants: string[] }
export interface WalletCharge extends Payment { item: string; merchant: string; created_at: string }
export interface AgentWallet {
  status: 'not_connected' | 'pending' | 'active' | 'revoked';
  connected_at: string | null;
  customer_id: string | null;
  data_source: DataSource;
  guardrails: WalletGuardrails;
  budget: { currency: Currency; daily_cap: number; spent_today: number; remaining_today: number };
  recent_charges: WalletCharge[];
}
export type PaymentIntent = 'authorize' | 'capture' | 'auto';
export interface CreateOrderRequest { purchase_request_id: string; intent?: PaymentIntent }
export interface CaptureOrderRequest { paypal_order_id: string }

export interface Merchant {
  id: string; name: string; category: string; status: MerchantStatus;
  trust_score: number; // 0-100
  per_transaction_limit: number | null; monthly_limit: number | null; currency: Currency;
}

export interface AuditLog {
  id: string;
  actor: string; // user id, 'agent:<name>' or 'system'
  action: string; entity_type: string; entity_id: string | null; detail: string;
  created_at: string; data_source: DataSource;
}

export interface DashboardSummary {
  total_volume: number; currency: Currency;
  approved_count: number; blocked_count: number; pending_count: number; high_risk_count: number;
  daily_utilization_pct: number;
  risk_distribution: Record<RiskCategory, number>;
  history: { date: string; approved: number; blocked: number; volume: number }[];
  activity: { id: string; message: string; created_at: string }[];
  data_source: DataSource;
}

export interface Paginated<T> { items: T[]; total: number; page: number; page_size: number }
export interface ApiErrorBody { error: { code: string; message: string; details?: unknown } }

export type SortDir = 'asc' | 'desc';
export type TransactionSortKey = 'created_at' | 'amount' | 'risk_score' | 'merchant';
export interface TransactionQuery {
  search?: string;
  policy_decision?: PolicyDecision;
  payment_status?: PaymentStatus;
  risk_category?: RiskCategory;
  sort_by?: TransactionSortKey;
  sort_dir?: SortDir;
  page?: number;
  page_size?: number;
}
export interface TransactionDetail extends Transaction {
  merchant_trust_score: number | null;
  policy_evaluation: PolicyEvaluation | null;
  risk_assessment: RiskAssessment | null;
  timeline: { label: string; at: string }[];
}

/* ---- Phase 6 additions (mirror docs/API_CONTRACT.md) ---- */
export interface PurchaseRequestQuery { status?: RequestStatus; page?: number; page_size?: number }
export type ApprovalDecision = 'approved' | 'rejected';
export interface DecisionRequest { decision: ApprovalDecision; note?: string }
export interface RefundRequest { amount?: number }

export interface AgentChatRequest { message: string }
export interface AgentChatResponse { reply: string; parser_source: ExplanationSource; purchase_request: PurchaseRequest; wallet_outcome?: 'charged' | 'fell_back' | 'failed' | 'not_applicable' | null; payment?: Payment | null }

export interface PolicyDiffRow { field: string; old: unknown; new: unknown }
export interface PolicyCopilotResponse {
  summary: string;
  changes: Record<string, unknown>;
  diff: PolicyDiffRow[];
  proposed_policy: SpendingPolicy;
  source: ExplanationSource;
  warnings: string[];
}
export type SpendingPolicyInput = Omit<SpendingPolicy, 'updated_at'>;

export interface AuditLogQuery { action?: string; page?: number; page_size?: number }
export interface DemoScenarioResponse { items: PurchaseRequest[] }

export interface HealthStatus {
  status: string;
  paypal_configured: boolean;
  paypal_mode: 'sandbox' | 'live';
  paypal_webhook_verification: boolean;
  gemini_configured: boolean;
  gemini_model: string;
}

export interface AgentIdentity {
  id: string;
  name: string;
  key_prefix: string;
  status: 'active' | 'revoked';
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  calls_total: number;
  calls_last_hour: number;
  purchase_requests: number;
}

export interface AgentCreated {
  agent: AgentIdentity;
  api_key: string;
  note: string;
}

export interface AgentActivity {
  agent: AgentIdentity;
  events: { id: string; action: string; detail: string; created_at: string; source: string }[];
  requests: { id: string; item: string; merchant: string; amount: number; currency: Currency; status: RequestStatus; decision: string | null; payment_status: string; created_at: string }[];
}

/* ---- Phase 4: transaction timeline ---- */
export type TimelineSource = 'AgentGuard' | 'Agent via MCP' | 'PayPal webhook';
export interface TimelineEvent {
  id: string;
  kind: string;
  title: string;
  detail: string;
  source: TimelineSource;
  icon: string;
  at: string;
  paypal_ids: { order_id?: string; authorization_id?: string; capture_id?: string; event_id?: string; resource_id?: string };
  highlight: boolean;
  verified: boolean | null;
  simulated: boolean;
}
export interface TransactionTimeline {
  transaction_id: string;
  payment_status: string;
  live: boolean;
  events: TimelineEvent[];
  sandbox: boolean;
  generated_at: string;
}
export interface Narration { narration: string; source: 'gemini' | 'rule_based'; source_label: 'Gemini' | 'rules' }
