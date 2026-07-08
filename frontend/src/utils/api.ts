import type { AttachmentCategory, ClaimCase } from '../types/claim';

export interface Icd10SearchItem {
  id: string;
  code: string;
  name: string;
  level1: string;
  level2: string;
  level3: string;
  injury_part: string;
  severity: string;
  treatment: string;
}

export interface Icd10SearchResponse {
  items: Icd10SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  level1Options: string[];
  level2Options: string[];
  level3Options: string[];
  level4Options: string[];
  updatedAt?: string;
}

export interface WorkInjuryStandardResponse {
  id: string;
  province: string;
  city?: string;
  household_type?: '城镇' | '农村' | '';
  disability_base_per_year: number;
  death_base_per_year: number;
  compensation_years: number;
  updated_at: string;
  source: string;
  matchedBy?: {
    province: boolean;
    city: boolean;
    householdType: boolean;
  };
}

export interface HospitalSearchItem {
  id: string;
  name: string;
  credit_code: string;
  province: string;
  city: string;
  district: string;
}

export interface HospitalSearchResponse {
  items: HospitalSearchItem[];
  total: number;
  page: number;
  pageSize: number;
  provinceOptions: string[];
  cityOptions: string[];
  districtOptions: string[];
}

export interface VehiclePartCategory {
  key: string;
  name: string;
}

export interface VehicleModel {
  id: string;
  vin: string;
  brand: string;
  series: string;
  year: number;
  trim: string;
  displacement: string;
  transmission: string;
  drive_form: string;
  category_l1: string;
  category_l2: string;
  category_l3: string;
  category_l4: string;
  manufacturer: string;
  origin: string;
  msrp_total: number;
  categories: VehiclePartCategory[];
}

export interface VehiclePart {
  id: string;
  oem_code: string;
  name: string;
  original_name: string;
  category: string;
  subcategory: string;
  price_msrp: number;
  price_market: number;
  vehicle_model_id: string;
}

export interface VehiclePartSearchResponse {
  items: VehiclePart[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RepairOrderItem {
  id: string;
  part_id: string;
  oem_code: string;
  name: string;
  original_name: string;
  category: string;
  price_msrp: number;
  price_market: number;
  quantity: number;
  subtotal_msrp: number;
  subtotal_market: number;
}

export interface RepairOrder {
  id: string;
  case_id: string;
  task_id?: string;
  vehicle_model_id: string;
  vin: string;
  brand: string;
  series: string;
  trim: string;
  total_msrp: number;
  total_market: number;
  items: RepairOrderItem[];
  created_at: string;
  updated_at: string;
}

// ─── 辅助管理：复勘 / 调查 / 诉讼 ──────────────────────────────────
export type ReInspectionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface ReInspectionTask {
  id: string;
  case_no: string;
  case_id?: string;
  rider_name?: string;
  trigger_reason: string;
  inspector: string;
  scheduled_at?: string;
  completed_at?: string;
  location?: string;
  conclusion?: string;
  blocking: boolean;
  status: ReInspectionStatus;
  created_at: string;
  updated_at: string;
  remark?: string;
}

export type InvestigationType = 'FIELD' | 'INTERVIEW' | 'EVIDENCE' | 'PUBLIC_SECURITY' | 'OTHER';
export type InvestigationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export interface InvestigationTask {
  id: string;
  case_no: string;
  case_id?: string;
  rider_name?: string;
  investigation_type: InvestigationType;
  investigator: string;
  target: string;
  scheduled_at?: string;
  completed_at?: string;
  finding?: string;
  status: InvestigationStatus;
  blocking: boolean;
  created_at: string;
  updated_at: string;
  remark?: string;
}

export type LitigationRole = 'PLAINTIFF' | 'DEFENDANT' | 'THIRD_PARTY';
export type LitigationStatus = 'ACCEPTED' | 'IN_TRIAL' | 'JUDGMENT' | 'CLOSED' | 'WITHDRAWN';
export type LitigationAgentType = 'STAFF' | 'LAWYER';
export interface LitigationRecord {
  id: string;
  case_no: string;
  case_id?: string;
  rider_name?: string;
  court: string;
  case_court_no?: string;
  accepted_at?: string;
  role: LitigationRole;
  counterparty?: string;
  claim_amount?: number;
  judgment_at?: string;
  judgment_summary?: string;
  judgment_amount?: number;
  court_fee?: number;
  agent_type?: LitigationAgentType;
  lawyer_name?: string;
  lawyer_fee?: number;
  status: LitigationStatus;
  created_at: string;
  updated_at: string;
  remark?: string;
}

// ─── 补充任务（统一表）───────────────────────────────────────────────
export type AuxiliaryType = 'RE_INSPECTION' | 'INVESTIGATION';
export type AuxiliaryStatus = 'PENDING' | 'UNDER_REVIEW' | 'COMPLETED' | 'REJECTED';
export interface AuxiliaryTask {
  id: string;
  case_id: string;
  case_no: string;
  case_task_id?: string;
  auxiliary_type: AuxiliaryType;
  status: AuxiliaryStatus;
  blocking: boolean;
  title: string;
  reason: string;
  operator: string;
  reviewer?: string;
  conclusion?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  remark?: string;
}

const rawApiBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL?.trim();
const API_BASE_URL = rawApiBaseUrl ? rawApiBaseUrl.replace(/\/$/, '') : '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface RegionNode {
  value: string;
  label: string;
  children?: RegionNode[];
}

export const api = {
  getClaims: () => request<ClaimCase[]>('/claims'),
  getRegions: () => request<RegionNode[]>('/regions'),
  getClaimById: (id: string) => request<ClaimCase>(`/claims/${id}`),
  saveClaim: (id: string, payload: ClaimCase) => request<ClaimCase>(`/claims/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createClaim: (payload: any) => request<{ success: boolean; data: ClaimCase }>('/claims', { method: 'POST', body: JSON.stringify(payload) }),
  splitClaim: (id: string, payload: {
    has_rider_injury: boolean;
    has_third_injury: boolean;
    has_vehicle_loss: boolean;
    has_property_loss: boolean;
  }) =>
    request<{ success: boolean; data: ClaimCase[]; case_no: string }>(`/claims/${id}/split`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getAttachments: (id: string) => request<AttachmentCategory[]>(`/claims/${id}/attachments`),
  addAttachments: (id: string, folder: string, files: any[]) =>
    request<{ success: boolean; data: AttachmentCategory[] }>(`/claims/${id}/attachments`, {
      method: 'POST',
      body: JSON.stringify({ folder, files }),
    }),
  deleteAttachment: (id: string, folder: string, fileId: string) =>
    request<{ success: boolean; data: AttachmentCategory[] }>(`/claims/${id}/attachments/${folder}/${fileId}`, {
      method: 'DELETE',
    }),
  moveAttachments: (id: string, fromFolder: string, toFolder: string, fileIds: string[]) =>
    request<{ success: boolean; data: AttachmentCategory[] }>(`/claims/${id}/attachments/move`, {
      method: 'POST',
      body: JSON.stringify({ fromFolder, toFolder, fileIds }),
    }),
  searchIcd10: (params: { keyword?: string; level1?: string; level2?: string; level3?: string; level4?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && `${value}` !== '') {
        search.set(key, String(value));
      }
    });
    return request<Icd10SearchResponse>(`/icd10/search?${search.toString()}`);
  },
  getWorkInjuryStandard: (params: { province?: string; city?: string; householdType?: string }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && `${value}` !== '') {
        search.set(key, String(value));
      }
    });
    return request<WorkInjuryStandardResponse>(`/work-injury-standards?${search.toString()}`);
  },
  searchHospitals: (params: { province?: string; city?: string; district?: string; keyword?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && `${value}` !== '') {
        search.set(key, String(value));
      }
    });
    return request<HospitalSearchResponse>(`/hospitals/search?${search.toString()}`);
  },
  searchVehicleByVin: (vin: string) => {
    const search = new URLSearchParams();
    search.set('vin', vin);
    return request<{ model: VehicleModel | null }>(`/vehicles/search?${search.toString()}`);
  },
  listVehicleModels: (keyword?: string) => {
    const search = new URLSearchParams();
    if (keyword) search.set('keyword', keyword);
    return request<{ items: VehicleModel[] }>(`/vehicles/search?${search.toString()}`);
  },
  getVehicleCategories: (modelId: string) =>
    request<{ items: VehiclePartCategory[] }>(`/vehicles/${modelId}/categories`),
  searchVehicleParts: (params: { vehicleModelId: string; category?: string; keyword?: string; page?: number; pageSize?: number }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (key === 'vehicleModelId') return;
      if (value !== undefined && value !== null && `${value}` !== '') {
        search.set(key, String(value));
      }
    });
    return request<VehiclePartSearchResponse>(`/vehicles/${params.vehicleModelId}/parts?${search.toString()}`);
  },
  getRepairOrder: (caseId: string) => request<RepairOrder | null>(`/cases/${caseId}/repair-order`),
  saveRepairOrder: (caseId: string, payload: Partial<RepairOrder>) =>
    request<RepairOrder>(`/cases/${caseId}/repair-order`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteRepairOrder: (caseId: string) =>
    request<{ success: boolean }>(`/cases/${caseId}/repair-order`, { method: 'DELETE' }),

  // 复勘任务
  listReInspections: () => request<{ items: ReInspectionTask[] }>('/re-inspections'),
  getReInspection: (id: string) => request<ReInspectionTask>(`/re-inspections/${id}`),
  createReInspection: (payload: Partial<ReInspectionTask>) =>
    request<{ success: boolean; data: ReInspectionTask }>('/re-inspections', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateReInspection: (id: string, payload: Partial<ReInspectionTask>) =>
    request<{ success: boolean; data: ReInspectionTask }>(`/re-inspections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteReInspection: (id: string) =>
    request<{ success: boolean }>(`/re-inspections/${id}`, { method: 'DELETE' }),

  // 调查任务
  listInvestigations: () => request<{ items: InvestigationTask[] }>('/investigations'),
  getInvestigation: (id: string) => request<InvestigationTask>(`/investigations/${id}`),
  createInvestigation: (payload: Partial<InvestigationTask>) =>
    request<{ success: boolean; data: InvestigationTask }>('/investigations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateInvestigation: (id: string, payload: Partial<InvestigationTask>) =>
    request<{ success: boolean; data: InvestigationTask }>(`/investigations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteInvestigation: (id: string) =>
    request<{ success: boolean }>(`/investigations/${id}`, { method: 'DELETE' }),

  // 诉讼登记
  listLitigations: () => request<{ items: LitigationRecord[] }>('/litigations'),
  getLitigation: (id: string) => request<LitigationRecord>(`/litigations/${id}`),
  createLitigation: (payload: Partial<LitigationRecord>) =>
    request<{ success: boolean; data: LitigationRecord }>('/litigations', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateLitigation: (id: string, payload: Partial<LitigationRecord>) =>
    request<{ success: boolean; data: LitigationRecord }>(`/litigations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteLitigation: (id: string) =>
    request<{ success: boolean }>(`/litigations/${id}`, { method: 'DELETE' }),

  // ─── 补充任务（统一表）───────────────────────────────────────────────
  auxiliaryTasks: {
    list: (filter?: { case_id?: string; case_task_id?: string; auxiliary_type?: AuxiliaryType; status?: AuxiliaryStatus }) => {
      const search = new URLSearchParams();
      if (filter) {
        Object.entries(filter).forEach(([k, v]) => {
          if (v) search.set(k, String(v));
        });
      }
      const qs = search.toString();
      return request<AuxiliaryTask[]>(`/auxiliary-tasks${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<AuxiliaryTask>(`/auxiliary-tasks/${id}`),
    create: (payload: Partial<AuxiliaryTask>) =>
      request<{ success: boolean; data: AuxiliaryTask }>('/auxiliary-tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: Partial<AuxiliaryTask>) =>
      request<{ success: boolean; data: AuxiliaryTask }>(`/auxiliary-tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/auxiliary-tasks/${id}`, { method: 'DELETE' }),
  },
};

export { API_BASE_URL };