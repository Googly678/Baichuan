export type CaseStatus =
  | 'PENDING_SPLIT'
  | 'PENDING'
  | 'SUBMITTED_REG'
  | 'REG_APPROVED'
  | 'SUBMITTED_AGREEMENT'
  | 'AGREEMENT_APPROVED'
  | 'SUBMITTED_SURVEY'
  | 'SURVEY_APPROVED'
  | 'DONE';

export interface LossItem {
  id: string;
  category: string;
  amount: number;
  remark: string;
  audited?: boolean;
  standard?: number;
  duration?: number;
  formula?: string;
}

export interface TaskItem {
  id: string;
  task_type: 'rider_injury' | 'third_injury' | 'third_vehicle' | 'third_property';
  status: CaseStatus;
  flow_status?: 'PROCESSING' | 'SUBMITTED' | 'UNDER_REVIEW' | 'RETURNED' | 'ASSESSED' | 'FINISHED';
  loss_items: LossItem[];
}

export interface PaymentInfoItem {
  id: string;
  payee_name: string;
  bank_name: string;
  bank_account: string;
  payment_amount: number;
}

export interface AttachmentFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document';
  dataUrl?: string;  // Base64 encoded file data for demo
}

export interface AttachmentCategory {
  key: string;  // 'identity', 'medical', 'accident', etc.
  title: string;
  files: AttachmentFile[];
}

export interface AuditLogEntry {
  id: string;
  time: string;
  operator: string;
  action: string;
  remark?: string;
}

export interface ClaimCase {
  id: string;
  case_no: string;
  vehicle_type: string;
  vehicle_label: string;
  is_motor: boolean;
  status: CaseStatus;
  reporter: string;
  rider_name: string;
  rider_type: '专送' | '众包';
  company: string;
  report_time: string;
  accident_time: string;
  accident_location: string;
  product: string;
  tasks: TaskItem[];
  has_litigation: boolean;
  litigation_judgment?: string;
  has_investigation: boolean;
  investigation_blocking: boolean;
  liability_ratio?: number;
  reg_approved_time?: string;
  reg_amount?: number;
  agreement_approved_time?: string;
  agreement_amount?: number;
  survey_approved_time?: string;
  survey_amount?: number;
  /** 实际赔款（结案时写入，含诉讼费/律师费；普通结案时 = survey_amount） */
  actual_payout?: number;
  task_details?: Record<string, any>;
  attachments?: AttachmentCategory[];
  payment_infos?: PaymentInfoItem[];
  audit_logs?: AuditLogEntry[];
}

export interface CoreClaimRecord {
  case_no: string;
  accident_time: string;
  report_time: string;
  reg_approved_time?: string;
  reg_amount?: number;
  agreement_approved_time?: string;
  agreement_amount?: number;
  survey_approved_time?: string;
  survey_amount?: number;
  updated_at: string;
}

export interface DemoDatabase {
  cases: ClaimCase[];
}

export interface CoreDatabase {
  records: CoreClaimRecord[];
}