import React, { useState, useContext, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Descriptions, Button, Tag, Space, message, Steps, Table,
  Select, Popconfirm, InputNumber, Input, Modal, Form, Divider,
  Alert, Typography, Tooltip, Timeline, Switch, Row, Col, AutoComplete, Checkbox,
} from 'antd';
import {
  SaveOutlined, WarningOutlined, LockOutlined, EditOutlined, PlusOutlined,
  AuditOutlined, CheckCircleOutlined,
  SearchOutlined, CameraOutlined, PaperClipOutlined,
  MedicineBoxOutlined, HomeOutlined, RiseOutlined, CarOutlined, UserOutlined,
} from '@ant-design/icons';
import { RoleContext } from '../App';
import {
  INJURY_DETAIL_TYPES, PROPERTY_DETAIL_TYPES, DISABILITY_LEVEL,
  IS_MOTOR_VEHICLE, TASK_STATUS_LABEL, TASK_STATUS_COLOR, TASK_TYPE_LABEL, deriveCaseStatusFromTasks, deriveTaskFlowStatus,
  VEHICLE_TYPE_OPTIONS,
} from '../utils/constants';
import VehiclePartsCard from '../components/VehiclePartsCard';
import LaborFeeCard, { type LaborOrderItem } from '../components/LaborFeeCard';
import type { ClaimCase, LossItem, CaseStatus, PaymentInfoItem, TaskItem } from '../types/claim';
import { api, type HospitalSearchItem, type Icd10SearchItem, type WorkInjuryStandardResponse } from '../utils/api';

const { Text, Title } = Typography;
const { confirm } = Modal;

const ROLE_DISPLAY: Record<string, string> = {
  CUSTOMER_SERVICE:     '客服专员',
  ADMIN:                '管理人',
  INJURY_SURVEYOR:      '人伤查勘员',
  INJURY_AUDITOR:       '人伤审核员',
  PROPERTY_SURVEYOR:    '物损查勘员',
  PROPERTY_AUDITOR:     '物损审核员',
  LITIGATION_OPERATOR:  '诉讼作业岗',
  LITIGATION_AUDITOR:   '诉讼审核岗',
};

// ─── 状态机步骤映射 ───────────────────────────────────────────────────────────
const STATUS_STEP: Record<string, number> = {
  PENDING: 0,
  SUBMITTED_REG: 1,
  REG_APPROVED: 2,
  SUBMITTED_AGREEMENT: 3,
  AGREEMENT_APPROVED: 4,
  SUBMITTED_SURVEY: 4,
  SURVEY_APPROVED: 5,
  DONE: 6,
};

const STEP_ITEMS = [
  { title: '查勘录入' },
  { title: '立案审核' },
  { title: '协议上报' },
  { title: '协议审核' },
  { title: '定损审核' },
  { title: '定损通过' },
  { title: '已结案' },
];

// 审计日志条目（本地演示）
interface AuditEntry {
  id: string;
  time: string;
  operator: string;
  action: string;
  node?: string;
  remark?: string;
}

const INITIAL_AUDIT: AuditEntry[] = [
  { id: 'audit-init', time: '2026-04-07 16:50', operator: '管理员-王五', action: '创建报案', node: '报案' },
];

const EMPTY_CASE: ClaimCase = {
  id: '',
  case_no: '',
  vehicle_type: 'E_BIKE',
  vehicle_label: '',
  is_motor: false,
  status: 'PENDING',
  reporter: '',
  rider_name: '',
  rider_type: '专送',
  company: '',
  report_time: '',
  accident_time: '',
  accident_location: '',
  product: '',
  tasks: [],
  has_litigation: false,
  has_investigation: false,
  investigation_blocking: false,
  liability_ratio: 100,
  task_details: {},
  attachments: [],
  payment_infos: [],
  audit_logs: [],
};

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { role } = useContext(RoleContext);
  const [caseData, setCaseData] = useState<ClaimCase>(EMPTY_CASE);
  const [loadingCase, setLoadingCase] = useState(true);
  const [splitSelection, setSplitSelection] = useState<string[]>(['rider_injury']);
  // 案件主信息编辑弹窗
  const [caseEditOpen, setCaseEditOpen] = useState(false);
  const [caseEditSaving, setCaseEditSaving] = useState(false);
  const [caseEditForm] = Form.useForm();
  // 追加任务弹窗
  const [appendTaskOpen, setAppendTaskOpen] = useState(false);
  const [appendTaskTypes, setAppendTaskTypes] = useState<string[]>([]);
  const [appendTaskSaving, setAppendTaskSaving] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const reviewingTaskRef = useRef<string>('');

  // 按当前角色条线过滤可见任务
  const visibleTasks =
    role === 'ADMIN'
      ? caseData.tasks
      : role === 'CUSTOMER_SERVICE'
      ? caseData.tasks
      : role === 'INJURY_SURVEYOR' || role === 'INJURY_AUDITOR'
      ? caseData.tasks.filter(t => t.task_type === 'rider_injury' || t.task_type === 'third_injury')
      : caseData.tasks.filter(t => t.task_type === 'third_property' || t.task_type === 'third_vehicle');

  // 任务选择（当前展示哪一项任务），优先取 URL ?taskId= 参数
  const taskIdFromUrl = searchParams.get('taskId') ?? '';
  const [activeTaskId, setActiveTaskId] = useState<string>(taskIdFromUrl || '');
  const activeTask = visibleTasks.find(t => t.id === activeTaskId) || visibleTasks[0];
  // 查勘员/审核员：未分流案件（无 tasks）时，构造一个与该角色条线对应的占位任务，
  // 使按钮区可基于 PENDING 状态渲染【提交立案】等按钮。
  const isSurveyorOrAuditor =
    role === 'INJURY_SURVEYOR' || role === 'INJURY_AUDITOR' ||
    role === 'PROPERTY_SURVEYOR' || role === 'PROPERTY_AUDITOR';
  const fallbackTaskForSurveyor =
    !activeTask && isSurveyorOrAuditor
      ? ({
          id: '__pending_split__',
          task_type: (role === 'INJURY_SURVEYOR' || role === 'INJURY_AUDITOR'
            ? 'rider_injury'
            : 'third_vehicle') as TaskItem['task_type'],
          status: 'PENDING' as CaseStatus,
          loss_items: [] as LossItem[],
        } as TaskItem)
      : null;
  const effectiveActiveTask = activeTask || fallbackTaskForSurveyor;
  const currentTaskStatus = effectiveActiveTask?.status || caseData.status;

  useEffect(() => {
    if (!taskIdFromUrl) return;
    // taskId 存在于所有任务（不仅是当前角色可见的）中就不算无效
    const allTaskIds = new Set(caseData.tasks.map((t) => t.id));
    if (allTaskIds.has(taskIdFromUrl)) {
      // 合法的 taskId，但不在当前角色可见范围内，静默切换
      const fallbackId = visibleTasks[0]?.id || '';
      if (fallbackId && fallbackId !== activeTaskId) {
        setActiveTaskId(fallbackId);
      }
      const nextSearch = new URLSearchParams(searchParams);
      nextSearch.delete('taskId');
      navigate({ search: nextSearch.toString() ? `?${nextSearch.toString()}` : '' }, { replace: true });
      return;
    }

    // 真正无效的 taskId
    const nextTaskId = visibleTasks[0]?.id || '';
    if (nextTaskId !== activeTaskId) {
      setActiveTaskId(nextTaskId);
    }
    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.delete('taskId');
    navigate({ search: nextSearch.toString() ? `?${nextSearch.toString()}` : '' }, { replace: true });
  }, [taskIdFromUrl, visibleTasks, activeTaskId, searchParams, navigate, caseData.tasks]);

  const syncCaseTaskStatus = (tasks: TaskItem[], fallbackStatus = caseData.status) => ({
    tasks,
    status: deriveCaseStatusFromTasks(tasks, fallbackStatus),
  });

  const appendAuditEntry = (operator: string, action: string, remark?: string, node?: string) => ({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    operator,
    action,
    node,
    remark,
  });

  const getSubmitFlowStatus = (newStatus: CaseStatus) => {
    if (newStatus === 'DONE') return 'FINISHED' as const;
    if (newStatus === 'SURVEY_APPROVED') return 'ASSESSED' as const;
    if (newStatus === 'SUBMITTED_REG' || newStatus === 'SUBMITTED_AGREEMENT' || newStatus === 'SUBMITTED_SURVEY') {
      return 'SUBMITTED' as const;
    }
    return 'PROCESSING' as const;
  };

  const buildPersistedCase = (tasksOverride?: TaskItem[], auditLogsOverride?: AuditEntry[]) => {
    const effectiveTaskId = activeTaskId || activeTask?.id;
    const tasksWithDraft = effectiveTaskId
      ? (tasksOverride || caseData.tasks).map((task) =>
          task.id === effectiveTaskId ? { ...task, loss_items: lossItems } : task
        )
      : (tasksOverride || caseData.tasks);

    const nextCase: ClaimCase = {
      ...caseData,
      liability_ratio: liabilityRatio,
      payment_infos: paymentInfos,
      audit_logs: auditLogsOverride || auditLog,
      task_details: effectiveTaskId
        ? {
            ...(caseData.task_details || {}),
            [effectiveTaskId]: buildTaskDetailSnapshot(),
          }
        : caseData.task_details,
      ...syncCaseTaskStatus(tasksWithDraft, caseData.status),
    };

    return nextCase;
  };

  const [lossItems, setLossItems] = useState<LossItem[]>(activeTask?.loss_items || []);
  const [paymentInfos, setPaymentInfos] = useState<PaymentInfoItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [auditRemark, setAuditRemark] = useState<string>(''); // 立案审核备注

  // 辅助流程 Modals
  const [reInspModal, setReInspModal] = useState(false);
  const [investigateModal, setInvestigateModal] = useState(false);
  const [litigationModal, setLitigationModal] = useState(false);
  const [judgmentModal, setJudgmentModal] = useState(false);
  const [reInspForm] = Form.useForm();
  const [investigateForm] = Form.useForm();
  const [litigationForm] = Form.useForm();
  const [judgmentForm] = Form.useForm();
  const [liabilityRatio, setLiabilityRatio] = useState<number>(100);

  type OCRApplyTarget = 'rider' | 'third' | 'generic';

  // ─── ICD-10 伤情描述状态 ──────────────────────────────────────────────────
  interface InjuryDesc {
    icd_input: string;   // 搜索输入（动态）
    icd_code: string;
    icd_name: string;
    injury_nature: string;
    severity: string;
    description: string;
  }
  const EMPTY_INJURY_DESC: InjuryDesc = {
    icd_input: '', icd_code: '', icd_name: '',
    injury_nature: '', severity: '', description: '',
  };
  const [injuryDesc, setInjuryDesc] = useState<InjuryDesc>(EMPTY_INJURY_DESC);
  const setID = (patch: Partial<InjuryDesc>) => setInjuryDesc(p => ({ ...p, ...patch }));

  // ─── 伤情/物损信息状态（查勘员录入，自动计算核损清单）────────────────────────
  // ─── 新版人伤信息（参照专业人伤录入系统）────────────────────────────────────
  interface InjuryBasicInfo {
    accident_type: string;   // 事故类型
    injured_type: string;    // 伤者类型
    vehicle_type_inj: string; // 创伤车辆
    liability_mark: string;  // 标的告至
    casualty_type: string;   // 伤亡类型：门诊/住院/伤残/死亡
    diagnosis_type: string;  // 就诊类型
  }
  interface InjuredPersonInfo {
    name: string; phone: string; id_type: string; id_no: string;
    birth_date: string; age: number; gender: string;
    household_type: string;   // 户口性质：城镇/农村
    domicile: string;         // 户籍地
    residence: string;        // 居住地
    contact_name: string; contact_relation: string; contact_phone: string;
    traffic_status: string;   // 伤亡交通状态
  }
  interface WorkInfo {
    occupation_type: string;  // 职业类型：固定职业/无固定职业
    industry: string;
    occupation_name: string;
    work_years: number;
    ref_standard: number;     // 参考标准（元/天）
    actual_income: number;    // 实际收入（元/天）
    salary_form: string;      // 工资发放形式
    unit_contact_phone: string;
    work_unit: string;
    remarks: string;
    has_labor_contract: boolean;
  }
  interface HospitalRecord {
    id: string;
    hospital_name: string;
    org_score: string;
    credit_code: string;
    dept: string;
    inpatient_no: string;
    admit_date: string;
    discharge_date: string;
    hospital_days: number;
  }
  interface DiagnosisRecord {
    id: string;
    icd_code?: string;
    level1_name?: string;
    level2_name?: string;
    level3_name?: string;
    level4_name?: string;
    injury_part1: string; injury_part2: string;
    injury_device: string;
    injury_diagram: string;
    treatment: string;
    main_diagnosis: string;
    report_disease: string;
  }
  interface MedicalFeeRecord {
    id: string;
    inpatient_fee: number;   // 住院医疗费
    invoice_amount: number;  // 发票金额
    insured_drug: number;    // 医保内用药
    non_insured_drug: number; // 医保外用药
    deduction: number;       // 扣除金额
  }
  interface FollowupRecord {
    id: string;
    treatment_item: string;
    expected_cost: number;
    period: string;
    hospital: string;
    remark: string;
  }
  interface InjuryInfo {
    injury_subtype: string;
    injury_parts: string; injury_degree: string; diagnosis: string;
    hospital_name: string; admit_date: string; discharge_date: string; hospital_days: number;
    medical_total: number; outpatient_fee: number; inpatient_fee: number;
    lost_work_days: number; daily_wage: number;
    nursing_days: number; nursing_daily_fee: number;
    is_death: boolean; funeral_fee: number;
    disability_level: number;
  }
  interface PropertyInfo {
    damage_desc: string; vehicle_repair: number; depreciation: number;
    towing_fee: number; personal_items: number; other_fee: number;
  }

  // ─── 骑手人伤（rider_injury）表单接口 ──────────────────────────────────────
  interface RiderInjuryForm {
    insurance_type: string;      // 'employer'雇主责任险 | 'accident'意外险
    accident_desc: string;       // 事故经过
    injury_parts: string;        // 受伤部位
    is_fatal: boolean;           // 是否死亡
    monthly_wage: number;        // 月均工资
    salary_form: string;         // 工资发放形式
    work_years: number;          // 工作年限（月）
    wage_proof_note: string;     // 工资证明说明
    lost_work_days: number;      // 误工天数
    daily_wage_standard: number; // 日均误工费标准
    nursing_days: number;        // 护理天数
    daily_nursing_fee: number;   // 日均护理费
    nursing_level: string;       // 护理需求等级
    disability_level: string;    // 伤残等级（根据险种对应不同标准）
    appraisal_org: string;       // 鉴定机构
    appraisal_date: string;      // 鉴定日期
    appraisal_no: string;        // 鉴定报告编号
  }
  interface RiderMedicalRecord {
    id: string;
    visit_type: string;  // 门诊/住院
    hospital: string;
    visit_date: string;
    amount: number;
    remark: string;
  }
  // ─── 三者人伤（third_injury）19项赔偿接口 ──────────────────────────────────
  interface ThirdInjuryItem {
    id: string;
    item_name: string;
    item_key: string;
    claimed_amount: number;  // 请求金额（查勘员录入）
    audited_amount: number;  // 核损金额（审核员录入）
    calc_basis: string;      // 计算依据
    approved: boolean;       // 审核员核准标记
  }
  // 三者人伤 19 项赔偿项目（按《最高人民法院人身损害赔偿司法解释》）
  const THIRD_INJURY_DEFAULT: ThirdInjuryItem[] = [
    { id:'1',  item_key:'medical_fee',      item_name:'医疗费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'2',  item_key:'hospital_meal',    item_name:'住院伙食补助费',   claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'3',  item_key:'nutrition',        item_name:'营养费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'4',  item_key:'nursing',          item_name:'护理费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'5',  item_key:'lost_work',        item_name:'误工费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'6',  item_key:'transport',        item_name:'交通费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'7',  item_key:'accommodation',    item_name:'住宿费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'8',  item_key:'disability_comp',  item_name:'残疾赔偿金',       claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'9',  item_key:'disability_aid',   item_name:'残疾辅助器具费',   claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'10', item_key:'dependent_living', item_name:'被扶养人生活费',   claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'11', item_key:'mental_damage',    item_name:'精神损害抚慰金',   claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'12', item_key:'death_comp',       item_name:'死亡赔偿金',       claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'13', item_key:'funeral',          item_name:'丧葬费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'14', item_key:'followup',         item_name:'后续治疗费',       claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'15', item_key:'rehab',            item_name:'康复费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'16', item_key:'plastic',          item_name:'整容费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'17', item_key:'appraisal',        item_name:'鉴定费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'18', item_key:'attorney',         item_name:'律师费',           claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
    { id:'19', item_key:'other',            item_name:'其他合理费用',     claimed_amount:0, audited_amount:0, calc_basis:'', approved:false },
  ];

  const [injuryBasic, setInjuryBasic] = useState<InjuryBasicInfo>({
    accident_type: '', injured_type: '', vehicle_type_inj: '',
    liability_mark: '', casualty_type: '', diagnosis_type: '',
  });
  const [injuredPerson, setInjuredPerson] = useState<InjuredPersonInfo>({
    name: '', phone: '', id_type: '身份证', id_no: '',
    birth_date: '', age: 0, gender: '男',
    household_type: '', domicile: '', residence: '',
    contact_name: '', contact_relation: '本人', contact_phone: '',
    traffic_status: '',
  });
  const [workInfo, setWorkInfo] = useState<WorkInfo>({
    occupation_type: '固定职业', industry: '', occupation_name: '',
    work_years: 0, ref_standard: 0, actual_income: 0,
    salary_form: '', unit_contact_phone: '', work_unit: '', remarks: '',
    has_labor_contract: false,
  });
  const [hospitalRecords, setHospitalRecords] = useState<HospitalRecord[]>([]);
  const [diagnosisRecords, setDiagnosisRecords] = useState<DiagnosisRecord[]>([]);
  const [medicalFeeRecords, setMedicalFeeRecords] = useState<MedicalFeeRecord[]>([
    { id: '1', inpatient_fee: 0, invoice_amount: 0, insured_drug: 0, non_insured_drug: 0, deduction: 0 },
  ]);
  const [followupRecords, setFollowupRecords] = useState<FollowupRecord[]>([]);

  // ─── 骑手人伤专用状态 ─────────────────────────────────────────────────────
  const [riderInjury, setRiderInjury] = useState<RiderInjuryForm>({
    insurance_type: '', accident_desc: '', injury_parts: '', is_fatal: false,
    monthly_wage: 0, salary_form: '', work_years: 0, wage_proof_note: '',
    lost_work_days: 0, daily_wage_standard: 0,
    nursing_days: 0, daily_nursing_fee: 0, nursing_level: '',
    disability_level: '', appraisal_org: '', appraisal_date: '', appraisal_no: '',
  });
  const [riderMedicals, setRiderMedicals] = useState<RiderMedicalRecord[]>([
    { id: '1', visit_type: '', hospital: '', visit_date: '', amount: 0, remark: '' },
  ]);
  // ─── 三者人伤专用状态（19项固定赔偿项目）────────────────────────────────
  const [thirdInjuryItems, setThirdInjuryItems] = useState<ThirdInjuryItem[]>(THIRD_INJURY_DEFAULT);

  const [injuryInfo, setInjuryInfo] = useState<InjuryInfo>({
    injury_subtype: '',
    injury_parts: '', injury_degree: '', diagnosis: '',
    hospital_name: '', admit_date: '', discharge_date: '', hospital_days: 0,
    medical_total: 0, outpatient_fee: 0, inpatient_fee: 0,
    lost_work_days: 0, daily_wage: 0, nursing_days: 0, nursing_daily_fee: 0,
    is_death: false, funeral_fee: 0, disability_level: 0,
  });
  const [propertyInfo, setPropertyInfo] = useState<PropertyInfo>({
    damage_desc: '', vehicle_repair: 0, depreciation: 0,
    towing_fee: 0, personal_items: 0, other_fee: 0,
  });
  const [caseComment, setCaseComment] = useState<string>('');
  const [timelineExpanded, setTimelineExpanded] = useState(false);

  interface PolicyInfo {
    policy_no: string;
    insurer: string;
    policy_name: string;
    start_date: string;
    end_date: string;
    applicant: string;
    applicant_id_no: string;
    insured: string;
  }
  interface AccidentInfoForm {
    claimant_name: string;
    claimant_id_no: string;
    claimant_id_type: string;
    phone: string;
    vehicle_tool: string;
    has_alarm: boolean;
    has_driver_license: boolean;
    has_vehicle_license: boolean;
    order_no: string;
    accident_type: string;
    liability_level: string;
    accident_time: string;
    province: string;
    city: string;
    district: string;
    address_detail: string;
    accident_desc: string;
  }
  interface PersonBlockInfo {
    name: string;
    phone: string;
    household_type: string;
    id_no: string;
    birth_date: string;
    age: number;
    gender: string;
    domicile: string;
    residence: string;
    address_detail: string;
    contact_name: string;
    relation: string;
    contact_phone: string;
  }
  interface EmploymentForm {
    job_type: string;
    industry: string;
    years: number;
    day_income: number;
    company: string;
    company_contact_phone: string;
    company_address: string;
  }
  interface DisabilityForm {
    appraisal_method: string;
    appraisal_org: string;
    appraisal_standard: string;
    disability_level: string;
    disability_clause: string;
    related_diagnosis_id: string;
  }
  interface DeathForm {
    deceased_name: string;
    compensation_years: number;
    autopsy: boolean;
    fatal_diagnosis_id: string;
  }
  interface HospitalOption {
    id: string;
    name: string;
    credit_code: string;
    province: string;
    city: string;
    district: string;
  }
  interface DiagnosisOption extends Icd10SearchItem {
    diagnosis: string;
  }
  interface InjurySettlementRow {
    id: string;
    category: string;
    standard: number;
    duration: number;
    duration_unit: '日' | '年';
  }

  const LOSS_SELECT_OPTIONS = ['医疗费用', '误工费', '护理费', '伤残赔偿金', '死亡赔偿'];
  const PROPERTY_LOSS_OPTIONS = ['随车随身物品损失', '车辆维修费', '工时费', '拖车施救费', '其他财产损失'];

  interface VehicleRepairRow {
    id: string;
    brand: string;
    model: string;
    damage_position: string;
    damaged_part: string;
    repair_type: '维修' | '换件';
    price: number;
  }
  const DEFAULT_SETTLEMENT_ROWS: Record<string, InjurySettlementRow> = {
    医疗费用: { id: 'settle-medical', category: '医疗费', standard: 0, duration: 1, duration_unit: '日' },
    误工费: { id: 'settle-lostwork', category: '误工费', standard: 0, duration: 0, duration_unit: '日' },
    护理费: { id: 'settle-nursing', category: '护理费', standard: 0, duration: 0, duration_unit: '日' },
    伤残赔偿金: { id: 'settle-disability', category: '伤残赔偿金', standard: 0, duration: 1, duration_unit: '年' },
    死亡赔偿: { id: 'settle-death', category: '死亡赔偿金', standard: 0, duration: 1, duration_unit: '年' },
  };

  const policyInfo: PolicyInfo = {
    policy_no: 'POL-2026-8899001',
    insurer: '太平洋保险',
    policy_name: '骑手综合责任险',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    applicant: '顺丰速运',
    applicant_id_no: '91310000XXXXXXXXXX',
    insured: caseData.rider_name || '本案被保险人',
  };

  const [accidentForm, setAccidentForm] = useState<AccidentInfoForm>({
    claimant_name: caseData.rider_name || '', claimant_id_no: '', claimant_id_type: '身份证',
    phone: '', vehicle_tool: '电动车', has_alarm: false, has_driver_license: false, has_vehicle_license: false,
    order_no: '', accident_type: '双方事故', liability_level: '同责', accident_time: caseData.accident_time || '',
    province: '', city: '', district: '', address_detail: caseData.accident_location || '', accident_desc: '',
  });
  const [injuredDetail, setInjuredDetail] = useState<PersonBlockInfo>({
    name: '', phone: '', household_type: '', id_no: '', birth_date: '', age: 0, gender: '男',
    domicile: '', residence: '', address_detail: '', contact_name: '', relation: '', contact_phone: '',
  });
  const [workForm, setWorkForm] = useState<EmploymentForm>({
    job_type: '全职', industry: '', years: 0, day_income: 0, company: '', company_contact_phone: '', company_address: '',
  });
  const [nursingForm, setNursingForm] = useState<EmploymentForm>({
    job_type: '全职', industry: '', years: 0, day_income: 0, company: '', company_contact_phone: '', company_address: '',
  });
  const [disabilityForm, setDisabilityForm] = useState<DisabilityForm>({
    appraisal_method: '自鉴定', appraisal_org: '', appraisal_standard: '', disability_level: '', disability_clause: '', related_diagnosis_id: '',
  });
  const [deathForm, setDeathForm] = useState<DeathForm>({
    deceased_name: '', compensation_years: 20, autopsy: false, fatal_diagnosis_id: '',
  });

  const [selectedLossTypes, setSelectedLossTypes] = useState<string[]>(LOSS_SELECT_OPTIONS);
  const [injurySettlementRows, setInjurySettlementRows] = useState<InjurySettlementRow[]>(LOSS_SELECT_OPTIONS.map((k) => ({ ...DEFAULT_SETTLEMENT_ROWS[k] })));
  const [selectedPropertyLossTypes, setSelectedPropertyLossTypes] = useState<string[]>(PROPERTY_LOSS_OPTIONS);
  const [vehicleRepairRows, setVehicleRepairRows] = useState<VehicleRepairRow[]>([]);
  const [laborItems, setLaborItems] = useState<LaborOrderItem[]>([]);

  const [hospitalPickerOpen, setHospitalPickerOpen] = useState(false);
  const [hospitalFilter, setHospitalFilter] = useState({ province: '', city: '', district: '', keyword: '' });
  const [hospitalOptions, setHospitalOptions] = useState<HospitalSearchItem[]>([]);
  const [hospitalProvinceOptions, setHospitalProvinceOptions] = useState<string[]>([]);
  const [hospitalCityOptions, setHospitalCityOptions] = useState<string[]>([]);
  const [hospitalDistrictOptions, setHospitalDistrictOptions] = useState<string[]>([]);
  const [hospitalPage, setHospitalPage] = useState(1);
  const [hospitalPageSize, setHospitalPageSize] = useState(20);
  const [hospitalTotal, setHospitalTotal] = useState(0);
  const [hospitalLoading, setHospitalLoading] = useState(false);
  const [diagPickerOpen, setDiagPickerOpen] = useState(false);
  const [diagFilter, setDiagFilter] = useState({ level1: '', level2: '', level3: '', level4: '', keyword: '' });
  const [diagOptions, setDiagOptions] = useState<DiagnosisOption[]>([]);
  const [diagLevel1Options, setDiagLevel1Options] = useState<string[]>([]);
  const [diagLevel2Options, setDiagLevel2Options] = useState<string[]>([]);
  const [diagLevel3Options, setDiagLevel3Options] = useState<string[]>([]);
  const [diagLevel4Options, setDiagLevel4Options] = useState<string[]>([]);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagPage, setDiagPage] = useState(1);
  const [diagPageSize, setDiagPageSize] = useState(20);
  const [diagTotal, setDiagTotal] = useState(0);
  const [workInjuryStandard, setWorkInjuryStandard] = useState<WorkInjuryStandardResponse | null>(null);
  const [repairOrderMarketTotal, setRepairOrderMarketTotal] = useState<number>(0);

  const buildTaskDetailSnapshot = () => ({
    injuryDesc,
    accidentForm,
    injuredDetail,
    workForm,
    nursingForm,
    hospitalRecords,
    diagnosisRecords,
    medicalFeeRecords,
    disabilityForm,
    deathForm,
    selectedLossTypes,
    injurySettlementRows,
    selectedPropertyLossTypes,
    vehicleRepairRows,
    laborItems,
    propertyInfo,
    caseComment,
    riderInjury,
    riderMedicals,
    thirdInjuryItems,
    lossItems,
  });

  const applyTaskDetailSnapshot = (snapshot?: any) => {
    setInjuryDesc(snapshot?.injuryDesc || EMPTY_INJURY_DESC);
    setAccidentForm(snapshot?.accidentForm || {
      claimant_name: caseData.rider_name || '', claimant_id_no: '', claimant_id_type: '身份证',
      phone: '', vehicle_tool: '电动车', has_alarm: false, has_driver_license: false, has_vehicle_license: false,
      order_no: '', accident_type: '双方事故', liability_level: '同责', accident_time: caseData.accident_time || '',
      province: '', city: '', district: '', address_detail: caseData.accident_location || '', accident_desc: '',
    });
    setInjuredDetail(snapshot?.injuredDetail || {
      name: '', phone: '', household_type: '', id_no: '', birth_date: '', age: 0, gender: '男',
      domicile: '', residence: '', address_detail: '', contact_name: '', relation: '', contact_phone: '',
    });
    setWorkForm(snapshot?.workForm || { job_type: '全职', industry: '', years: 0, day_income: 0, company: '', company_contact_phone: '', company_address: '' });
    setNursingForm(snapshot?.nursingForm || { job_type: '全职', industry: '', years: 0, day_income: 0, company: '', company_contact_phone: '', company_address: '' });
    setHospitalRecords(snapshot?.hospitalRecords || []);
    setDiagnosisRecords(snapshot?.diagnosisRecords || []);
    setMedicalFeeRecords(snapshot?.medicalFeeRecords || [{ id: '1', inpatient_fee: 0, invoice_amount: 0, insured_drug: 0, non_insured_drug: 0, deduction: 0 }]);
    setDisabilityForm(snapshot?.disabilityForm || { appraisal_method: '自鉴定', appraisal_org: '', appraisal_standard: '', disability_level: '', disability_clause: '', related_diagnosis_id: '' });
    setDeathForm(snapshot?.deathForm || { deceased_name: '', compensation_years: 20, autopsy: false, fatal_diagnosis_id: '' });
    setSelectedLossTypes(snapshot?.selectedLossTypes || LOSS_SELECT_OPTIONS);
    setInjurySettlementRows(snapshot?.injurySettlementRows || LOSS_SELECT_OPTIONS.map((k) => ({ ...DEFAULT_SETTLEMENT_ROWS[k] })));
    setSelectedPropertyLossTypes(snapshot?.selectedPropertyLossTypes || PROPERTY_LOSS_OPTIONS);
    setVehicleRepairRows(snapshot?.vehicleRepairRows || []);
    setLaborItems(snapshot?.laborItems || []);
    setPropertyInfo(snapshot?.propertyInfo || { damage_desc: '', vehicle_repair: 0, depreciation: 0, towing_fee: 0, personal_items: 0, other_fee: 0 });
    setCaseComment(snapshot?.caseComment || '');
    setRiderInjury(snapshot?.riderInjury || {
      insurance_type: '', accident_desc: '', injury_parts: '', is_fatal: false,
      monthly_wage: 0, salary_form: '', work_years: 0, wage_proof_note: '',
      lost_work_days: 0, daily_wage_standard: 0,
      nursing_days: 0, daily_nursing_fee: 0, nursing_level: '',
      disability_level: '', appraisal_org: '', appraisal_date: '', appraisal_no: '',
    });
    setRiderMedicals(snapshot?.riderMedicals || [{ id: '1', visit_type: '', hospital: '', visit_date: '', amount: 0, remark: '' }]);
    setThirdInjuryItems(snapshot?.thirdInjuryItems || THIRD_INJURY_DEFAULT);
    setLossItems(snapshot?.lossItems || activeTask?.loss_items || []);
  };

  useEffect(() => {
    if (!id) return;
    setLoadingCase(true);
    api.getClaimById(id)
      .then((data) => {
        setCaseData(data);
        setAuditLog(data.audit_logs || INITIAL_AUDIT);
        setPaymentInfos(data.payment_infos || []);
        setLiabilityRatio(data.liability_ratio ?? 100);
        const nextTaskId = (taskIdFromUrl && data.tasks.some((t) => t.id === taskIdFromUrl)) ? taskIdFromUrl : (data.tasks[0]?.id || '');
        setActiveTaskId(nextTaskId);
      })
      .catch((err) => message.error(`获取案件详情失败：${err.message}`))
      .finally(() => setLoadingCase(false));
  }, [id, taskIdFromUrl]);

  // 监听来自AttachmentViewer的OCR识别结果
  useEffect(() => {
    const handleOCRMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OCR_RESULT') {
        const result = event.data.data || {};
        const meta = event.data.meta || {};
        const msgTarget = (meta.target || 'generic') as OCRApplyTarget;
        const sourceCaseRef = meta.caseRef as string | undefined;
        const currentCaseRef = caseData.case_no || caseData.id || id || '';
        const currentTarget: OCRApplyTarget =
          effectiveActiveTask?.task_type === 'rider_injury'
            ? 'rider'
            : effectiveActiveTask?.task_type === 'third_injury'
            ? 'third'
            : 'generic';
        const canApplyOCR =
          !caseData.has_litigation &&
          !caseData.investigation_blocking &&
          (
            role === 'ADMIN' ||
            (role === 'INJURY_SURVEYOR' && currentTarget !== 'generic') ||
            (role === 'PROPERTY_SURVEYOR' && (effectiveActiveTask?.task_type === 'third_property' || effectiveActiveTask?.task_type === 'third_vehicle'))
          );

        if (sourceCaseRef && currentCaseRef && sourceCaseRef !== currentCaseRef) {
          message.warning('已拦截应用：来源案件与当前任务案件不一致。');
          return;
        }
        if (msgTarget !== 'generic' && currentTarget !== msgTarget) {
          const targetText = msgTarget === 'rider' ? '骑手人伤' : '三者人伤';
          message.warning(`已拦截应用：该识别结果仅可应用到${targetText}任务。`);
          return;
        }
        if (currentTarget === 'generic') {
          message.warning('当前任务不是人伤任务，无法应用OCR识别结果。');
          return;
        }
        if (!canApplyOCR) {
          message.warning('当前角色无编辑权限，无法应用到表单。');
          return;
        }

        if (result.idNumber) {
          const birth = result.birthday || '';
          const age = typeof result.age === 'number'
            ? result.age
            : birth
            ? Math.max(0, new Date().getFullYear() - new Date(birth).getFullYear())
            : 0;
          setInjuredDetail((prev) => ({
            ...prev,
            name: result.name || prev.name,
            id_no: result.idNumber || prev.id_no,
            birth_date: birth || prev.birth_date,
            age: age || prev.age,
            domicile: result.address || prev.domicile,
          }));
          if (currentTarget === 'rider') {
            setAccidentForm((prev) => ({
              ...prev,
              claimant_name: result.name || prev.claimant_name,
              claimant_id_no: result.idNumber || prev.claimant_id_no,
            }));
          }
          message.success('身份证姓名、证件号和户籍地已回填到伤者表单。');
        } else if (result.diagnosis) {
          setDiagnosisRecords((prev) => {
            const exists = prev.some((x) => x.main_diagnosis === result.diagnosis);
            if (exists) return prev;
            return [
              ...prev,
              {
                id: `ocr-diag-${Date.now()}`,
                icd_code: '',
                level1_name: '',
                level2_name: '',
                level3_name: '',
                level4_name: result.diagnosis,
                injury_part1: '',
                injury_part2: '',
                injury_device: '',
                injury_diagram: '',
                treatment: '保守治疗',
                main_diagnosis: result.diagnosis,
                report_disease: result.date || '',
              },
            ];
          });
          message.success('病历诊断已回填到临床诊断列表。');
        } else if (result.amount) {
          const amount = Number(result.amount || 0);
          const nonMedical = Number(result.nonMedicalDrugAmount || 0);
          setMedicalFeeRecords((prev) => {
            const base = prev.length > 0
              ? [...prev]
              : [{ id: 'ocr-med-0', inpatient_fee: 0, invoice_amount: 0, insured_drug: 0, non_insured_drug: 0, deduction: 0 }];
            const first = base[0];
            base[0] = {
              ...first,
              invoice_amount: amount,
              non_insured_drug: nonMedical,
              inpatient_fee: Math.max(0, amount - nonMedical - (first.deduction || 0)),
            };
            return base;
          });

          if (activeTaskId) {
            const newItem: LossItem = {
              id: `ocr-${Date.now()}`,
              category: 'MEDICAL_FEE',
              amount,
              remark: `OCR识别：发票金额￥${amount}${nonMedical ? `（含非医保￥${nonMedical}）` : ''}`,
              audited: false,
            };
            setLossItems((prev) => [...prev, newItem]);
          }
          message.success('发票金额已回填并同步到损失项。');
        }
      }
    };

    window.addEventListener('message', handleOCRMessage);
    return () => window.removeEventListener('message', handleOCRMessage);
  }, [activeTask, activeTaskId, role, caseData.case_no, caseData.id, caseData.has_litigation, caseData.investigation_blocking, id]);

  const recalcFromInjury = (info: InjuryInfo): LossItem[] => {
    const items: LossItem[] = [];
    if (info.medical_total > 0)
      items.push({ id: 'auto-medical', category: 'MEDICAL_FEE', amount: info.medical_total, remark: `门诊¥${info.outpatient_fee} + 住院¥${info.inpatient_fee}`, audited: false });
    const lostFee = (info.lost_work_days || 0) * (info.daily_wage || 0);
    if (lostFee > 0)
      items.push({ id: 'auto-lostwork', category: 'LOST_INCOME', amount: lostFee, remark: `${info.lost_work_days}天 × ¥${info.daily_wage}/天`, audited: false });
    const nurFee = (info.nursing_days || 0) * (info.nursing_daily_fee || 0);
    if (nurFee > 0)
      items.push({ id: 'auto-nursing', category: 'NURSING_FEE', amount: nurFee, remark: `${info.nursing_days}天 × ¥${info.nursing_daily_fee}/天`, audited: false });
    if (info.disability_level > 0) {
      // 伤残赔偿金 = 保单伤残保额 × 等级系数 × 赔偿年限
      // 保额取自保单（当前为占位 0），系数见 utils/constants.ts 的 DISABILITY_LEVEL
      const levelMap: Record<string, number> = {
        '一级': 1, '二级': 2, '三级': 3, '四级': 4, '五级': 5,
        '六级': 6, '七级': 7, '八级': 8, '九级': 9, '十级': 10,
      };
      const lv = levelMap[info.disability_level] || 0;
      const ratio = lv ? DISABILITY_LEVEL[lv]?.ratio || 0 : 0;
      // TODO: 接入保单后取 info.disability_coverage_amount 作为 base
      const baseFromPolicy = (info as any).disability_coverage_amount || 0;
      const years = 1; // 占位：接保单后按规则（20 / 5 / etc.）取
      const amount = Math.round(baseFromPolicy * ratio * years);
      items.push({
        id: 'auto-disability',
        category: 'DISABILITY_COMP',
        amount,
        remark: baseFromPolicy > 0
          ? `${DISABILITY_LEVEL[lv]?.label}（保额¥${baseFromPolicy.toLocaleString()} × ${(ratio * 100).toFixed(0)}% × ${years}年）`
          : `${DISABILITY_LEVEL[lv]?.label}（保额待补录）`,
        audited: false,
      });
    }
    if (info.is_death) {
      items.push({ id: 'auto-death', category: 'DEATH_COMP', amount: 240000, remark: '死亡赔偿金（演示额）', audited: false });
      if (info.funeral_fee > 0)
        items.push({ id: 'auto-funeral', category: 'FUNERAL_FEE', amount: info.funeral_fee, remark: '丧葬费', audited: false });
    }
    return items;
  };

  const recalcFromProperty = (info: PropertyInfo): LossItem[] => {
    const items: LossItem[] = [];
    if (info.vehicle_repair > 0)
      items.push({ id: 'auto-vrepair', category: 'VEHICLE_REPAIR', amount: Math.max(0, info.vehicle_repair - (info.depreciation || 0)), remark: `维修¥${info.vehicle_repair} 扣折旧¥${info.depreciation || 0}`, audited: false });
    if (info.towing_fee > 0)
      items.push({ id: 'auto-towing', category: 'TOWING_FEE', amount: info.towing_fee, remark: '拖车施救费', audited: false });
    if (info.personal_items > 0)
      items.push({ id: 'auto-personal', category: 'PERSONAL_ITEMS', amount: info.personal_items, remark: '随车物品损失', audited: false });
    if (info.other_fee > 0)
      items.push({ id: 'auto-other', category: 'OTHER_PROPERTY', amount: info.other_fee, remark: '其他财产损失', audited: false });
    return items;
  };

  const recalcFromRiderInjury = (form: RiderInjuryForm, medicals: RiderMedicalRecord[]): LossItem[] => {
    const items: LossItem[] = [];
    const medTotal = medicals.reduce((s, r) => s + (r.amount || 0), 0);
    if (medTotal > 0)
      items.push({ id: 'auto-rider-medical', category: 'MEDICAL_FEE', amount: medTotal, remark: `医疗费明细合计（${medicals.length}条）`, audited: false });

    const lostWorkFee = (form.lost_work_days || 0) * (form.daily_wage_standard || 0);
    if (lostWorkFee > 0)
      items.push({ id: 'auto-rider-lostwork', category: 'LOST_INCOME', amount: lostWorkFee, remark: `${form.lost_work_days}天 × ¥${form.daily_wage_standard}/天`, audited: false });

    const nursingFee = (form.nursing_days || 0) * (form.daily_nursing_fee || 0);
    if (nursingFee > 0)
      items.push({ id: 'auto-rider-nursing', category: 'NURSING_FEE', amount: nursingFee, remark: `${form.nursing_days}天 × ¥${form.daily_nursing_fee}/天`, audited: false });

    if (form.is_fatal)
      items.push({ id: 'auto-rider-death', category: 'DEATH_COMP', amount: 240000, remark: '死亡赔偿金（演示额）', audited: false });

    return items;
  };

  const THIRD_INJURY_TO_CATEGORY: Record<string, string> = {
    medical_fee: 'MEDICAL_FEE',
    hospital_meal: 'NUTRITION_FEE',
    nutrition: 'NUTRITION_FEE',
    nursing: 'NURSING_FEE',
    lost_work: 'LOST_INCOME',
    transport: 'TRANSPORTATION_FEE',
    disability_comp: 'DISABILITY_COMP',
    mental_damage: 'MENTAL_COMP',
    death_comp: 'DEATH_COMP',
    funeral: 'FUNERAL_FEE',
  };

  const recalcFromThirdInjury = (items: ThirdInjuryItem[]): LossItem[] => {
    return items
      .filter((x) => (x.audited_amount || 0) > 0 || (x.claimed_amount || 0) > 0)
      .map((x) => ({
        id: `auto-third-${x.item_key}`,
        category: THIRD_INJURY_TO_CATEGORY[x.item_key] || 'MENTAL_COMP',
        amount: (x.audited_amount || 0) > 0 ? (x.audited_amount || 0) : (x.claimed_amount || 0),
        remark: x.calc_basis || x.item_name,
        audited: !!x.approved,
      }));
  };

  const mergeAutoLossItems = (prev: LossItem[], nextAuto: LossItem[]) => {
    const manualItems = prev.filter((x) => !x.id.startsWith('auto-'));
    const prevAutoAudit = new Map(
      prev.filter((x) => x.id.startsWith('auto-')).map((x) => [x.id, x.audited])
    );
    const normalizedAuto = nextAuto.map((x) => ({ ...x, audited: prevAutoAudit.get(x.id) ?? x.audited }));
    return [...normalizedAuto, ...manualItems];
  };

  const updateInjuryInfo = (key: keyof InjuryInfo, value: any) => {
    const next = { ...injuryInfo, [key]: value };
    setInjuryInfo(next);
    setLossItems(recalcFromInjury(next));
  };

  const updatePropertyInfo = (key: keyof PropertyInfo, value: any) => {
    const next = { ...propertyInfo, [key]: value };
    setPropertyInfo(next);
  };

  const calcHospitalDays = (admit: string, discharge: string) => {
    if (!admit || !discharge) return 0;
    const a = new Date(admit).getTime();
    const d = new Date(discharge).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(d) || d < a) return 0;
    return Math.floor((d - a) / (24 * 60 * 60 * 1000));
  };

  const provinceOptions = hospitalProvinceOptions;
  const cityOptions = hospitalCityOptions;
  const districtOptions = hospitalDistrictOptions;
  const filteredHospitals = hospitalOptions;

  const filteredDiagnosisOptions = diagOptions;

  useEffect(() => {
    if (!diagPickerOpen) return;
    const timer = window.setTimeout(() => {
      setDiagLoading(true);
      api.searchIcd10({
        keyword: diagFilter.keyword,
        level1: diagFilter.level1,
        level2: diagFilter.level2,
        level3: diagFilter.level3,
        level4: diagFilter.level4,
        page: diagPage,
        pageSize: diagPageSize,
      }).then((result) => {
        setDiagOptions(result.items.map((item) => ({ ...item, diagnosis: item.name })));
        setDiagLevel1Options(result.level1Options || []);
        setDiagLevel2Options(result.level2Options || []);
        setDiagLevel3Options(result.level3Options || []);
        setDiagLevel4Options(result.level4Options || []);
        setDiagTotal(result.total || 0);
      }).catch((err) => {
        message.error(`ICD-10 查询失败：${err.message}`);
        setDiagOptions([]);
        setDiagTotal(0);
        setDiagLevel4Options([]);
      }).finally(() => {
        setDiagLoading(false);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [diagPickerOpen, diagFilter, diagPage, diagPageSize]);

  useEffect(() => {
    const rawArea = (injuredDetail.domicile || injuredDetail.residence || '').trim();
    const province = rawArea.match(/(北京市|上海市|天津市|重庆市|[^省]+省|[^自治区]+自治区)/)?.[0] || '';
    const city = rawArea.match(/([^市]+市)/)?.[0] || '';
    api.getWorkInjuryStandard({
      province,
      city,
      householdType: injuredDetail.household_type,
    }).then((result) => {
      setWorkInjuryStandard(result);
      setInjurySettlementRows((prev) => prev.map((row) => {
        if (row.id === 'settle-disability') {
          return { ...row, standard: result.disability_base_per_year, duration: result.compensation_years, duration_unit: '年' };
        }
        if (row.id === 'settle-death') {
          return { ...row, standard: result.death_base_per_year, duration: result.compensation_years, duration_unit: '年' };
        }
        return row;
      }));
      setDeathForm((prev) => ({ ...prev, compensation_years: result.compensation_years }));
    }).catch(() => {
      setWorkInjuryStandard(null);
    });
  }, [injuredDetail.domicile, injuredDetail.residence, injuredDetail.household_type]);

  useEffect(() => {
    if (!hospitalPickerOpen) return;
    const timer = window.setTimeout(() => {
      setHospitalLoading(true);
      api.searchHospitals({
        province: hospitalFilter.province,
        city: hospitalFilter.city,
        district: hospitalFilter.district,
        keyword: hospitalFilter.keyword,
        page: hospitalPage,
        pageSize: hospitalPageSize,
      }).then((result) => {
        setHospitalOptions(result.items || []);
        setHospitalProvinceOptions(result.provinceOptions || []);
        setHospitalCityOptions(result.cityOptions || []);
        setHospitalDistrictOptions(result.districtOptions || []);
        setHospitalTotal(result.total || 0);
      }).catch((err) => {
        message.error(`医院查询失败：${err.message}`);
        setHospitalOptions([]);
        setHospitalTotal(0);
      }).finally(() => {
        setHospitalLoading(false);
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [hospitalPickerOpen, hospitalFilter, hospitalPage, hospitalPageSize]);

  const disabilityClauseMap: Record<string, Record<string, string>> = {
    '工伤伤残鉴定标准': {
      '一级': 'GB/T 16180-2014 一级伤残条款',
      '二级': 'GB/T 16180-2014 二级伤残条款',
      '三级': 'GB/T 16180-2014 三级伤残条款',
      '四级': 'GB/T 16180-2014 四级伤残条款',
      '五级': 'GB/T 16180-2014 五级伤残条款',
      '六级': 'GB/T 16180-2014 六级伤残条款',
      '七级': 'GB/T 16180-2014 七级伤残条款',
      '八级': 'GB/T 16180-2014 八级伤残条款',
      '九级': 'GB/T 16180-2014 九级伤残条款',
      '十级': 'GB/T 16180-2014 十级伤残条款',
    },
    '人伤保险伤残鉴定标准': {
      '一级': 'JR/T 0083-2013 一级伤残条款',
      '二级': 'JR/T 0083-2013 二级伤残条款',
      '三级': 'JR/T 0083-2013 三级伤残条款',
      '四级': 'JR/T 0083-2013 四级伤残条款',
      '五级': 'JR/T 0083-2013 五级伤残条款',
      '六级': 'JR/T 0083-2013 六级伤残条款',
      '七级': 'JR/T 0083-2013 七级伤残条款',
      '八级': 'JR/T 0083-2013 八级伤残条款',
      '九级': 'JR/T 0083-2013 九级伤残条款',
      '十级': 'JR/T 0083-2013 十级伤残条款',
    },
    '人体损伤致残程度分级标准': {
      '一级': '人体损伤致残程度分级 一级条款',
      '二级': '人体损伤致残程度分级 二级条款',
      '三级': '人体损伤致残程度分级 三级条款',
      '四级': '人体损伤致残程度分级 四级条款',
      '五级': '人体损伤致残程度分级 五级条款',
      '六级': '人体损伤致残程度分级 六级条款',
      '七级': '人体损伤致残程度分级 七级条款',
      '八级': '人体损伤致残程度分级 八级条款',
      '九级': '人体损伤致残程度分级 九级条款',
      '十级': '人体损伤致残程度分级 十级条款',
    },
  };

  const fullSelectStyle = { width: '100%', minWidth: 160 };

  useEffect(() => {
    setInjurySettlementRows((prev) => {
      const existed = new Map(prev.map((x) => [x.category, x]));
      const toCategory = (label: string) => DEFAULT_SETTLEMENT_ROWS[label].category;
      return selectedLossTypes.map((label) => {
        const c = toCategory(label);
        return existed.get(c) ? { ...existed.get(c)! } : { ...DEFAULT_SETTLEMENT_ROWS[label] };
      });
    });
  }, [selectedLossTypes]);

  useEffect(() => {
    const firstRow = medicalFeeRecords[0];
    if (!firstRow) return;
    const medicalLoss = Math.max(0, (firstRow.invoice_amount || 0) - (firstRow.non_insured_drug || 0) - (firstRow.deduction || 0));
    setInjurySettlementRows((prev) => prev.map((x) => x.id === 'settle-medical' ? { ...x, standard: medicalLoss, duration: 1 } : x));
  }, [medicalFeeRecords]);

  useEffect(() => {
    const isInjuryTaskType = activeTask?.task_type === 'rider_injury' || activeTask?.task_type === 'third_injury';
    if (!isInjuryTaskType) return;
    const mapped: LossItem[] = injurySettlementRows
      .map((x) => {
        const amount = (x.standard || 0) * (x.duration || 0);
        const categoryMap: Record<string, string> = {
          '医疗费': 'MEDICAL_FEE',
          '误工费': 'LOST_INCOME',
          '护理费': 'NURSING_FEE',
          '伤残赔偿金': 'DISABILITY_COMP',
          '死亡赔偿金': 'DEATH_COMP',
        };
        return {
          id: `auto-settle-${x.id}`,
          category: categoryMap[x.category] || 'MENTAL_COMP',
          amount,
          remark: `${x.standard}/${x.duration_unit} × ${x.duration}${x.duration_unit}`,
          audited: false,
          standard: x.standard,
          duration: x.duration,
          formula: `${x.standard}/${x.duration_unit} × ${x.duration}${x.duration_unit}`,
        } as any;
      });

    // 人伤理算清单强制按损失项目唯一：每个项目仅保留一行
    setLossItems((prev) => {
      const auditedMap = new Map(prev.map((x) => [x.id, !!x.audited]));
      return mapped.map((x) => ({ ...x, audited: auditedMap.get(x.id) ?? false }));
    });
  }, [injurySettlementRows, activeTask?.task_type]);

  useEffect(() => {
    if (!visibleTasks.length) return;
    if (!activeTaskId || !visibleTasks.some((task) => task.id === activeTaskId)) {
      setActiveTaskId(visibleTasks[0].id);
    }
  }, [activeTaskId, visibleTasks]);

  useEffect(() => {
    if (!activeTaskId) return;
    const snapshot = (caseData.task_details || {})[activeTaskId];
    applyTaskDetailSnapshot(snapshot);
    const task = visibleTasks.find((item) => item.id === activeTaskId);
    setLossItems(snapshot?.lossItems || task?.loss_items || []);
  }, [activeTaskId, caseData.task_details, caseData.rider_name, caseData.accident_time, caseData.accident_location]);

  useEffect(() => {
    if (activeTask?.task_type !== 'third_property' && activeTask?.task_type !== 'third_vehicle') return;
    const repairTotal = repairOrderMarketTotal;
    const laborFeeTotal = laborItems.reduce((s, it) => s + it.labor_fee, 0);
    const mapped: LossItem[] = [];

    if (selectedPropertyLossTypes.includes('车辆维修费')) {
      mapped.push({
        id: 'auto-vrepair',
        category: 'VEHICLE_REPAIR',
        amount: repairTotal,
        remark: `配件工单合计（${repairTotal > 0 ? '已保存' : '未保存'}）`,
        audited: false,
      });
    }
    if (selectedPropertyLossTypes.includes('工时费')) {
      mapped.push({
        id: 'auto-labor',
        category: 'LABOR_FEE',
        amount: laborFeeTotal,
        remark: `工时费合计（${laborItems.length} 项）`,
        audited: false,
      });
    }
    if (selectedPropertyLossTypes.includes('拖车施救费')) {
      mapped.push({ id: 'auto-towing', category: 'TOWING_FEE', amount: propertyInfo.towing_fee || 0, remark: '拖车施救费', audited: false });
    }
    if (selectedPropertyLossTypes.includes('随车随身物品损失')) {
      mapped.push({ id: 'auto-personal', category: 'PERSONAL_ITEMS', amount: propertyInfo.personal_items || 0, remark: '随车随身物品损失', audited: false });
    }
    if (selectedPropertyLossTypes.includes('其他财产损失')) {
      mapped.push({ id: 'auto-other', category: 'OTHER_PROPERTY', amount: propertyInfo.other_fee || 0, remark: '其他财产损失', audited: false });
    }

    setLossItems((prev) => {
      const auditedMap = new Map(prev.map((x) => [x.id, !!x.audited]));
      return mapped.map((x) => ({ ...x, audited: auditedMap.get(x.id) ?? false }));
    });
  }, [activeTask?.task_type, selectedPropertyLossTypes, propertyInfo.towing_fee, propertyInfo.personal_items, propertyInfo.other_fee, laborItems, repairOrderMarketTotal]);

  useEffect(() => {
    if (loadingCase || !caseData.id || !activeTaskId) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const payload = buildPersistedCase();
        await api.saveClaim(caseData.id, payload);
        // 保存成功，不显示任何提示（避免打扰）
      } catch (err: any) {
        console.error('自动保存失败:', err);
        // 只在控制台记录，不向用户显示以免造成干扰
        // 但如果是网络错误，应该在界面上显示警告
        if (err?.message?.includes('network') || err?.message?.includes('fetch')) {
          message.error('网络连接失败，数据可能未保存！请检查网络并手动点击保存按钮。', 5);
        }
      }
    }, 600); // 增加延迟到 600ms，给用户更多时间继续编辑

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    loadingCase,
    caseData,
    activeTaskId,
    liabilityRatio,
    auditLog,
    injuryDesc,
    accidentForm,
    injuredDetail,
    workForm,
    nursingForm,
    hospitalRecords,
    diagnosisRecords,
    medicalFeeRecords,
    disabilityForm,
    deathForm,
    selectedLossTypes,
    injurySettlementRows,
    selectedPropertyLossTypes,
    vehicleRepairRows,
    propertyInfo,
    caseComment,
    paymentInfos,
    riderInjury,
    riderMedicals,
    thirdInjuryItems,
    lossItems,
  ]);

  useEffect(() => {
    if (!activeTaskId) return;
    setCaseData((prev) => ({
      ...prev,
      ...syncCaseTaskStatus(prev.tasks.map((t) => (t.id === activeTaskId ? { ...t, loss_items: lossItems } : t)), prev.status),
    }));
  }, [activeTaskId, lossItems]);

  useEffect(() => {
    const isAuditor = role === 'INJURY_AUDITOR' || role === 'PROPERTY_AUDITOR' || role === 'ADMIN';
    const inReviewQueue = currentTaskStatus === 'SUBMITTED_REG' || currentTaskStatus === 'SUBMITTED_AGREEMENT' || currentTaskStatus === 'SUBMITTED_SURVEY';
    const effectiveTaskId = activeTaskId || activeTask?.id || '';
    if (!isAuditor || !inReviewQueue || !effectiveTaskId || !activeTask || activeTask.flow_status === 'UNDER_REVIEW') {
      return;
    }
    if (reviewingTaskRef.current === effectiveTaskId) return;
    reviewingTaskRef.current = effectiveTaskId;

    const nextTasks = caseData.tasks.map((task) =>
      task.id === effectiveTaskId ? { ...task, flow_status: 'UNDER_REVIEW' as const } : task
    );
    const nextCase: ClaimCase = {
      ...caseData,
      ...syncCaseTaskStatus(nextTasks, caseData.status),
    };
    setCaseData(nextCase);
    api.saveClaim(nextCase.id, nextCase).catch(() => {
      reviewingTaskRef.current = '';
    });
  }, [role, currentTaskStatus, activeTaskId, activeTask, caseData]);

  // 页面卸载时保存数据
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!caseData.id || loadingCase) return;
      
      // 立即保存最新数据（不依赖 setState 的异步更新）
      const payload = buildPersistedCase();
      // beforeunload 时必须用原生 fetch + keepalive（不能 await Promise）
      // API base 通过 VITE_API_BASE_URL 在构建时注入；本地默认为空走 vite proxy
      const apiBase = ((import.meta as any).env?.VITE_API_BASE_URL || '').replace(/\/$/, '');
      fetch(`${apiBase}/claims/${caseData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true, // 页面卸载时仍保持连接
      }).catch(() => {
        // 忽略卸载时的错误
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [caseData, loadingCase]);

  // 切换任务时同步 lossItems
  const switchTask = (taskId: string) => {
    // 先保存当前任务的 lossItems 到 caseData
    const updated = caseData.tasks.map(t =>
      t.id === activeTaskId ? { ...t, loss_items: lossItems } : t
    );
    setCaseData(prev => ({
      ...prev,
      ...syncCaseTaskStatus(updated, prev.status),
      task_details: {
        ...(prev.task_details || {}),
        [activeTaskId]: buildTaskDetailSnapshot(),
      },
    }));
    setActiveTaskId(taskId);
  };

  const addLossItem = () => {
    setLossItems([...lossItems, { id: Date.now().toString(), category: '', amount: 0, remark: '', audited: false }]);
  };

  const addPaymentInfo = () => {
    setPaymentInfos((prev) => [
      ...prev,
      {
        id: `payment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        payee_name: '',
        bank_name: '',
        bank_account: '',
        payment_amount: 0,
      },
    ]);
  };

  const updatePaymentInfo = (itemId: string, key: keyof PaymentInfoItem, value: string | number) => {
    setPaymentInfos((prev) => prev.map((item) => (item.id === itemId ? { ...item, [key]: value } : item)));
  };

  const removePaymentInfo = (itemId: string) => {
    setPaymentInfos((prev) => prev.filter((item) => item.id !== itemId));
  };

  const removeLossItem = (itemId: string) => {
    setLossItems(lossItems.filter(item => item.id !== itemId));
  };

  const updateLossItem = (itemId: string, key: keyof LossItem, value: any) => {
    setLossItems(lossItems.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, [key]: value };
      if (key === 'category' && value === 'DISABILITY_COMP') {
        updated.remark = updated.remark || '请填写伤残等级';
      }
      return updated;
    }));
  };

  const markItemAudited = (itemId: string, audited: boolean) => {
    setLossItems(lossItems.map(item =>
      item.id === itemId ? { ...item, audited } : item
    ));
    addLog(role === 'INJURY_AUDITOR' ? '人伤审核员' : '物损审核员', audited ? '审核通过损失项' : '退回损失项');
  };

  const addLog = (operator: string, action: string, remark?: string) => {
    setAuditLog(prev => [...prev, {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      operator,
      action,
      remark,
    }]);
  };

  // 推进主状态
  const advanceStatus = async (newStatus: CaseStatus, actionLabel: string, shouldNavigate = false) => {
    const effectiveTaskId = activeTaskId || activeTask?.id;
    if (!effectiveTaskId) {
      message.warning('未定位到当前任务，请刷新后重试。');
      return;
    }
    const STATUS_NODE: Record<string, string> = {
      REG_APPROVED: '立案审核',
      SUBMITTED_AGREEMENT: '协议上报',
      AGREEMENT_APPROVED: '协议审核',
      SUBMITTED_SURVEY: '定损上报',
      SURVEY_APPROVED: '定损审核',
      DONE: '结案',
    };
    const remarkText = caseComment.trim() || undefined;
    const logEntry = appendAuditEntry(ROLE_DISPLAY[role] || role, actionLabel, remarkText, STATUS_NODE[newStatus] || actionLabel);
    const nextTasks = caseData.tasks.map((task) =>
      task.id === effectiveTaskId
        ? { ...task, status: newStatus, flow_status: getSubmitFlowStatus(newStatus) }
        : task
    );
    const nextCase = buildPersistedCase(nextTasks, [...auditLog, logEntry]);

    setCaseData(nextCase);
    setAuditLog((prev) => [...prev, logEntry]);
    setCaseComment(''); // 清空情况说明

    try {
      await api.saveClaim(nextCase.id, nextCase);
      message.success(`操作成功：${actionLabel}`);
      if (shouldNavigate) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      message.error(`保存失败：${err?.message || '请重试'}`);
    }
  };

  // 退回状态
  const rejectStatus = async (newStatus: CaseStatus) => {
    const effectiveTaskId = activeTaskId || activeTask?.id;
    if (!effectiveTaskId) {
      message.warning('未定位到当前任务，请刷新后重试。');
      return;
    }
    const remarkText = caseComment.trim() || undefined;
    const logEntry = appendAuditEntry(ROLE_DISPLAY[role] || role, '退回修改', remarkText, '退回');
    const nextTasks = caseData.tasks.map((task) =>
      task.id === effectiveTaskId
        ? { ...task, status: newStatus, flow_status: 'RETURNED' as const }
        : task
    );
    const nextCase = buildPersistedCase(nextTasks, [...auditLog, logEntry]);

    setCaseData(nextCase);
    setAuditLog((prev) => [...prev, logEntry]);
    setCaseComment(''); // 清空情况说明

    try {
      await api.saveClaim(nextCase.id, nextCase);
      message.warning('已退回，请查勘员修改后重新提交');
    } catch (err: any) {
      message.error(`保存失败：${err?.message || '请重试'}`);
    }
  };

  const showCenteredConfirm = (title: string, onOk: () => void, content?: string) => {
    confirm({
      title,
      content,
      centered: true,
      mask: true,
      okText: '确认',
      cancelText: '取消',
      onOk,
    });
  };

  const handleLossTypeChange = (vals: string[]) => {
    const next = vals as string[];
    const removed = selectedLossTypes.filter((x) => !next.includes(x));
    if (!removed.length) {
      setSelectedLossTypes(next);
      return;
    }

    const hasInputData = removed.some((label) => {
      const row = injurySettlementRows.find((x) => x.category === DEFAULT_SETTLEMENT_ROWS[label]?.category);
      return !!row && ((row.standard || 0) > 0 || (row.duration || 0) > 0);
    });

    if (!hasInputData) {
      setSelectedLossTypes(next);
      return;
    }

    showCenteredConfirm(
      `确认取消项目：${removed.join('、')}？`,
      () => setSelectedLossTypes(next),
      '取消后将从核损理算清单移除对应项目，避免误删请确认。'
    );
  };

  // 全部损失项是否已审核（用于判断是否可通过定损审核）
  const allInjuryAudited = caseData.tasks
    .filter(t => t.task_type === 'rider_injury' || t.task_type === 'third_injury')
    .every(t => t.loss_items.every(l => l.audited));

  const allPropertyAudited = caseData.tasks
    .filter(t => t.task_type === 'third_property' || t.task_type === 'third_vehicle')
    .every(t => t.loss_items.every(l => l.audited));

  const allAudited = allInjuryAudited && allPropertyAudited;
  const showPaymentInfoBlock = ['AGREEMENT_APPROVED', 'SUBMITTED_SURVEY', 'SURVEY_APPROVED', 'DONE'].includes(currentTaskStatus);
  const draftLossTotal = lossItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const paymentTotal = paymentInfos.reduce((sum, item) => sum + (item.payment_amount || 0), 0);
  const agreementApprovedAmount = typeof caseData.agreement_amount === 'number' ? caseData.agreement_amount : undefined;

  const invalidPaymentInfoCount = paymentInfos.filter((item) => {
    const hasName = !!item.payee_name?.trim();
    const hasBankName = !!item.bank_name?.trim();
    const hasBankAccount = !!item.bank_account?.trim();
    const hasAmount = (item.payment_amount || 0) > 0;
    return !(hasName && hasBankName && hasBankAccount && hasAmount);
  }).length;
  const exceedLossLimit = paymentTotal > draftLossTotal;
  const exceedAgreementLimit = typeof agreementApprovedAmount === 'number' && draftLossTotal > agreementApprovedAmount;
  const canSubmitSurveyReport = paymentInfos.length > 0 && invalidPaymentInfoCount === 0 && !exceedLossLimit && !exceedAgreementLimit;

  const getSubmitSurveyBlockReason = () => {
    if (!paymentInfos.length) return '请先录入至少 1 条支付信息';
    if (invalidPaymentInfoCount > 0) return `有 ${invalidPaymentInfoCount} 条支付信息未填完整`;
    if (exceedLossLimit) return '支付金额总额不能超过损失合计';
    if (exceedAgreementLimit) return '定损金额不能超过协议上报通过金额';
    return '';
  };

  const ensureCanSubmitSurveyReport = () => {
    if (!paymentInfos.length) {
      message.warning('提交定损上报前，请先至少录入 1 条支付信息。');
      return false;
    }
    if (invalidPaymentInfoCount > 0) {
      message.warning(`提交定损上报前，请完善支付信息：当前有 ${invalidPaymentInfoCount} 条记录不完整。`);
      return false;
    }
    if (exceedLossLimit) {
      message.warning('提交定损上报前，请调整支付信息：支付金额总额不能超过损失合计。');
      return false;
    }
    if (exceedAgreementLimit) {
      message.warning('提交定损上报前，请调整定损金额：定损金额不能超过协议上报通过金额。');
      return false;
    }
    return true;
  };

  // ─── 诉讼相关 ──────────────────────────────────────────────────────────────
  const handleRegisterLitigation = async (values: any) => {
    try {
      // 调辅助任务 API 落库
      await api.createLitigation({
        case_id: caseData.id,
        case_no: caseData.case_no,
        rider_name: caseData.rider_name,
        court: values.court || '（待补录）',
        case_court_no: values.case_court_no,
        accepted_at: values.accepted_at,
        role: values.role || 'DEFENDANT',
        counterparty: values.counterparty,
        claim_amount: values.claim_amount,
        agent_type: values.agent_type || 'STAFF',
        lawyer_name: values.lawyer_name,
        lawyer_fee: values.lawyer_fee,
        court_fee: values.court_fee,
        status: 'ACCEPTED',
        remark: values.case_reason,
      });
      // 同步案件层冻结
      const next: ClaimCase = { ...caseData, has_litigation: true };
      const saved = await api.saveClaim(caseData.id, next);
      setCaseData(saved);
      addLog(ROLE_DISPLAY[role] || role, '登记诉讼', `案由: ${values.case_reason}`);
      message.warning('诉讼已登记，案件进入挂起状态，所有推进操作暂停');
      setLitigationModal(false);
    } catch (err: any) {
      message.error(`登记诉讼失败：${err.message}`);
    }
  };

  const handleInputJudgment = async (values: any) => {
    try {
      // 找最近的一条诉讼记录写入判决字段
      const lits = await api.listLitigations();
      const items = Array.isArray(lits) ? lits : (lits as any).items || [];
      const myLit = items.find((l: any) => l.case_id === caseData.id) || items[0];
      if (myLit) {
        await api.updateLitigation(myLit.id, {
          judgment_at: values.judgment_at,
          judgment_summary: values.judgment,
          judgment_amount: values.judgment_amount,
          status: 'CLOSED',
        });
      }
      // 计算 actual_payout = 判决金额 + 律师费 + 诉讼费
      const payout = (values.judgment_amount || 0) + (myLit?.lawyer_fee || 0) + (myLit?.court_fee || 0);
      const next: ClaimCase = {
        ...caseData,
        has_litigation: false,
        litigation_judgment: values.judgment,
        status: 'DONE',
        actual_payout: payout,
      };
      const saved = await api.saveClaim(caseData.id, next);
      setCaseData(saved);
      addLog(ROLE_DISPLAY[role] || role, '录入判决结果', `实付 ¥ ${payout.toLocaleString()}`);
      message.success(`判决已录入，案件以诉讼结案（实付 ¥ ${payout.toLocaleString()}）`);
      setJudgmentModal(false);
    } catch (err: any) {
      message.error(`录入判决失败：${err.message}`);
    }
  };

  // ─── 辅助流程（统一表）────────────────────────────────────────────────────
  const handleReInspection = async (values: any) => {
    try {
      await api.auxiliaryTasks.create({
        case_id: caseData.id,
        case_no: caseData.case_no,
        case_task_id: activeTaskId || undefined,
        auxiliary_type: 'RE_INSPECTION',
        status: 'PENDING',
        blocking: false,
        title: values.title || '复勘',
        reason: values.reason || '（未填）',
        operator: ROLE_DISPLAY[role] || role,
        remark: values.remark,
      });
      addLog(ROLE_DISPLAY[role] || role, '发起复勘', `原因: ${values.reason}`);
      message.info('复勘任务已创建（独立表）');
      setReInspModal(false);
    } catch (err: any) {
      message.error(`发起复勘失败：${err.message}`);
    }
  };

  const handleInvestigation = async (values: any) => {
    try {
      await api.auxiliaryTasks.create({
        case_id: caseData.id,
        case_no: caseData.case_no,
        case_task_id: activeTaskId || undefined,
        auxiliary_type: 'INVESTIGATION',
        status: 'PENDING',
        blocking: !!values.blocking,
        title: values.title || '调查',
        reason: values.agency ? `调查机构：${values.agency}` : '（未填）',
        operator: ROLE_DISPLAY[role] || role,
        remark: values.remark,
      });
      // blocking=true 时同步设案件 investigation_blocking
      if (values.blocking) {
        const next: ClaimCase = {
          ...caseData,
          has_investigation: true,
          investigation_blocking: true,
        };
        const saved = await api.saveClaim(caseData.id, next);
        setCaseData(saved);
      }
      addLog(
        ROLE_DISPLAY[role] || role,
        '发起调查',
        `机构: ${values.agency}${values.blocking ? ' / 阻塞推进' : ''}`
      );
      message.info(`调查任务已创建${values.blocking ? '，案件推进将被阻塞直至调查完结' : ''}`);
      setInvestigateModal(false);
    } catch (err: any) {
      message.error(`发起调查失败：${err.message}`);
    }
  };

  const resolveInvestigation = async () => {
    try {
      // 找当前案件的 blocking 调查辅助任务，置为 COMPLETED
      const items = await api.auxiliaryTasks.list({ case_id: caseData.id, auxiliary_type: 'INVESTIGATION' });
      const blocking = (Array.isArray(items) ? items : []).find((i: any) => i.blocking && i.status !== 'COMPLETED');
      if (blocking) {
        await api.auxiliaryTasks.update(blocking.id, { status: 'COMPLETED', completed_at: new Date().toISOString() });
      }
      // 案件层解除阻塞
      const next: ClaimCase = { ...caseData, investigation_blocking: false };
      const saved = await api.saveClaim(caseData.id, next);
      setCaseData(saved);
      addLog(ROLE_DISPLAY[role] || role, '调查完结，解除阻塞');
      message.success('调查已完结，案件恢复可推进状态');
    } catch (err: any) {
      message.error(`完结调查失败：${err.message}`);
    }
  };

  const submitCustomerSplit = async () => {
    if (!caseData.id) return;
    const selected = new Set(splitSelection);
    if (selected.size === 0) {
      message.warning('请至少选择一个分流条线');
      return;
    }
    try {
      const result = await api.splitClaim(caseData.id, {
        has_rider_injury: selected.has('rider_injury'),
        has_third_injury: selected.has('third_injury'),
        has_vehicle_loss: selected.has('third_vehicle'),
        has_property_loss: selected.has('third_property'),
      });
      message.success(`分流成功：报案号 ${result.case_no} 生成 ${result.data.length} 个案件`);
      navigate('/cases');
    } catch (err: any) {
      message.error(`分流失败：${err.message}`);
    }
  };

  // ─── 案件主信息编辑：客服专员 / 管理人 可改 ─────────────────────────────────
  const openCaseEdit = () => {
    caseEditForm.setFieldsValue({
      reporter_name: (caseData as any).reporter_name || caseData.reporter,
      reporter_phone: (caseData as any).reporter_phone || '',
      accident_time: caseData.accident_time,
      accident_location: caseData.accident_location,
      accident_desc: (caseData as any).accident_desc || '',
      rider_name: caseData.rider_name,
      rider_id: (caseData as any).rider_id || '',
      order_id: (caseData as any).order_id || '',
      vehicle_type: caseData.vehicle_type,
      vehicle_plate: (caseData as any).vehicle_plate || '',
      product: caseData.product,
      liability_ratio: caseData.liability_ratio ?? 100,
    });
    setCaseEditOpen(true);
  };

  const submitCaseEdit = async () => {
    try {
      const values = await caseEditForm.validateFields();
      setCaseEditSaving(true);
      const logEntry = appendAuditEntry(ROLE_DISPLAY[role] || role, '编辑案件主信息');
      const next: ClaimCase = {
        ...caseData,
        reporter: values.reporter_name ?? caseData.reporter,
        rider_name: values.rider_name ?? caseData.rider_name,
        vehicle_type: values.vehicle_type ?? caseData.vehicle_type,
        vehicle_label: VEHICLE_TYPE_OPTIONS.find((o) => o.value === values.vehicle_type)?.label || caseData.vehicle_label,
        accident_time: values.accident_time ?? caseData.accident_time,
        accident_location: values.accident_location ?? caseData.accident_location,
        product: values.product ?? caseData.product,
        liability_ratio: Number(values.liability_ratio ?? 100),
        ...values,
        audit_logs: [...(caseData.audit_logs || []), logEntry],
      } as ClaimCase;
      // 保留 case_no / id / tasks / attachments / payment_infos 不被覆盖
      const persisted = await api.saveClaim(caseData.id, next);
      setCaseData(persisted);
      setAuditLog((prev) => [...prev, logEntry]);
      message.success('案件主信息已更新');
      setCaseEditOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`保存失败：${err?.message || '请重试'}`);
    } finally {
      setCaseEditSaving(false);
    }
  };

  // ─── 追加任务（已分流案件上追加新条线任务）─────────────────────────────────
  const TASK_TYPE_ADDABLE_OPTIONS = [
    { value: 'rider_injury',   label: '本车骑手人伤' },
    { value: 'third_injury',   label: '三者人伤' },
    { value: 'third_vehicle',  label: '三者车损' },
    { value: 'third_property', label: '三者物损' },
  ];

  const openAppendTask = () => {
    // 预过滤掉已存在的条线
    const existing = new Set((caseData.tasks || []).map((t) => t.task_type));
    setAppendTaskTypes([]);
    setAppendTaskOpen(true);
  };

  const submitAppendTask = async () => {
    if (appendTaskTypes.length === 0) {
      message.warning('请至少勾选一个条线');
      return;
    }
    setAppendTaskSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = caseData.tasks || [];
      const existingTypes = new Set(existing.map((t) => t.task_type));
      const appended: TaskItem[] = [];
      const added: string[] = [];
      for (const tt of appendTaskTypes) {
        if (existingTypes.has(tt as TaskItem['task_type'])) continue;
        const newTask: TaskItem = {
          id: `${caseData.id}-${tt}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          task_type: tt as TaskItem['task_type'],
          status: 'PENDING',
          loss_items: [],
        };
        appended.push(newTask);
        added.push(TASK_TYPE_LABEL[tt] || tt);
      }
      if (appended.length === 0) {
        message.warning('所选条线已全部存在，无需重复新增');
        return;
      }
      const logEntry = appendAuditEntry(ROLE_DISPLAY[role] || role, '追加任务', added.join('、'));
      const next: ClaimCase = {
        ...caseData,
        tasks: [...existing, ...appended],
        audit_logs: [...(caseData.audit_logs || []), logEntry],
      };
      const persisted = await api.saveClaim(caseData.id, next);
      setCaseData(persisted);
      setAuditLog((prev) => [...prev, logEntry]);
      // 默认切到第一个新追加的任务
      if (appended[0]) setActiveTaskId(appended[0].id);
      message.success(`已新增 ${appended.length} 个任务：${added.join('、')}`);
      setAppendTaskOpen(false);
    } catch (err: any) {
      message.error(`新增任务失败：${err?.message || '请重试'}`);
    } finally {
      setAppendTaskSaving(false);
    }
  };

  // ─── 编辑权限判断 ──────────────────────────────────────────────────────────
  const canEdit = !caseData.has_litigation && !caseData.investigation_blocking;
  const canEditCaseMain = canEdit && (role === 'CUSTOMER_SERVICE' || role === 'ADMIN');
  const canAppendTask = canEdit && (role === 'CUSTOMER_SERVICE' || role === 'ADMIN');
  const isCustomerSplitPending = role === 'CUSTOMER_SERVICE' && caseData.status === 'PENDING_SPLIT';
  const isRiderInjuryTask = effectiveActiveTask?.task_type === 'rider_injury';
  const isThirdInjuryTask = effectiveActiveTask?.task_type === 'third_injury';
  const isInjuryTask = isRiderInjuryTask || isThirdInjuryTask; // 权限判断合并变量
  const isPropertyTask =
    effectiveActiveTask?.task_type === 'third_property' ||
    effectiveActiveTask?.task_type === 'third_vehicle';
  const isSurveyor = role === 'INJURY_SURVEYOR' || role === 'PROPERTY_SURVEYOR';
  // 查勘员负责录入，审核员不可修改已录入信息
  const canEditSurveyForm = canEdit && (
    role === 'ADMIN' ||
    (role === 'INJURY_SURVEYOR' && isInjuryTask) ||
    (role === 'PROPERTY_SURVEYOR' && isPropertyTask)
  );
  const canEditItems = canEditSurveyForm; // 损失项表格跟调查表单权限一致
  const canAuditItems = canEdit && (
    (role === 'INJURY_AUDITOR' && isInjuryTask) ||
    (role === 'PROPERTY_AUDITOR' && isPropertyTask)
  );
  const isMotor = IS_MOTOR_VEHICLE[caseData.vehicle_type] || false;

  // ─── 核损清单表格列（损失项由上方信息录入自动生成，审核员对每行做审核标注）────
  const categoryOptions = isPropertyTask ? PROPERTY_DETAIL_TYPES : INJURY_DETAIL_TYPES;

  const lossColumns: any[] = isInjuryTask
    ? [
        {
          title: '损失类别',
          dataIndex: 'category',
          width: 160,
          render: (text: string) => {
            const opt = categoryOptions.find(o => o.value === text);
            return <Tag>{opt?.label || text || '—'}</Tag>;
          },
        },
        {
          title: '标准（日/年）',
          dataIndex: 'standard',
          width: 180,
          render: (_: any, r: any) => {
            const row = injurySettlementRows.find(x => `auto-settle-${x.id}` === r.id);
            if (!row) return <span>—</span>;
            return canEditSurveyForm ? (
              <InputNumber
                min={0}
                precision={2}
                value={row.standard}
                style={{ width: '100%' }}
                addonAfter={`元/${row.duration_unit}`}
                onChange={(v) => setInjurySettlementRows(prev => prev.map(x => x.id === row.id ? { ...x, standard: v || 0 } : x))}
              />
            ) : <span>¥{(row.standard || 0).toFixed(2)}/{row.duration_unit}</span>;
          },
        },
        {
          title: '损失时长（日/年）',
          dataIndex: 'duration',
          width: 170,
          render: (_: any, r: any) => {
            const row = injurySettlementRows.find(x => `auto-settle-${x.id}` === r.id);
            if (!row) return <span>—</span>;
            return canEditSurveyForm ? (
              <InputNumber
                min={0}
                max={row.id === 'settle-lostwork' ? 90 : undefined}
                value={row.duration}
                style={{ width: '100%' }}
                addonAfter={row.duration_unit}
                onChange={(v) => setInjurySettlementRows(prev => prev.map(x => x.id === row.id ? { ...x, duration: v || 0 } : x))}
              />
            ) : <span>{row.duration}{row.duration_unit}</span>;
          },
        },
        {
          title: '损失计算公式',
          dataIndex: 'formula',
          render: (_: any, r: any) => {
            const row = injurySettlementRows.find(x => `auto-settle-${x.id}` === r.id);
            if (!row) return <span>{r.remark || '—'}</span>;
            return <span>{`${row.standard}/${row.duration_unit} × ${row.duration}${row.duration_unit}`}</span>;
          },
        },
        {
          title: '损失金额',
          dataIndex: 'amount',
          width: 160,
          render: (v: number) => <Text strong style={{ color: '#cf1322' }}>¥{(v || 0).toFixed(2)}</Text>,
        },
      ]
    : [
        {
          title: '损失类别',
          dataIndex: 'category',
          width: 160,
          render: (text: string) => {
            const opt = categoryOptions.find(o => o.value === text);
            return <Tag>{opt?.label || text || '—'}</Tag>;
          },
        },
        {
          title: '金额（元）',
          dataIndex: 'amount',
          width: 130,
          render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 'bold' }}>¥{(v || 0).toFixed(2)}</span>,
        },
        {
          title: '备注 / 计算说明',
          dataIndex: 'remark',
          render: (text: string) => <span style={{ color: '#666', fontSize: 12 }}>{text || '—'}</span>,
        },
        {
          title: '来源',
          dataIndex: 'id',
          width: 80,
          render: (id: string) => id.startsWith('auto-')
            ? <Tag color="blue">自动带入</Tag>
            : <Tag color="orange">手动添加</Tag>,
        },
        {
          title: '审核状态',
          dataIndex: 'audited',
          width: 100,
          render: (audited: boolean) =>
            audited
              ? <Tag color="success" icon={<CheckCircleOutlined />}>已审核</Tag>
              : <Tag color="default">待审核</Tag>,
        },
        {
          title: '操作',
          width: 160,
          render: (_: any, record: LossItem) => (
            <Space>
              {canAuditItems && !record.audited && (
                <Popconfirm title="确认审核通过此损失项？" onConfirm={() => markItemAudited(record.id, true)}>
                  <Button type="link" size="small" icon={<CheckCircleOutlined />}>审核通过</Button>
                </Popconfirm>
              )}
              {canAuditItems && record.audited && (
                <Button type="link" danger size="small" onClick={() => markItemAudited(record.id, false)}>撤回审核</Button>
              )}
              {canEditSurveyForm && !record.id.startsWith('auto-') && (
                <Popconfirm title="确认删除此损失项？" onConfirm={() => removeLossItem(record.id)}>
                  <Button type="link" danger size="small">删除</Button>
                </Popconfirm>
              )}
            </Space>
          ),
        },
      ];

  // ─── 合计计算 ──────────────────────────────────────────────────────────────
  const totalAmount = lossItems.reduce((s, i) => s + (i.amount || 0), 0);
  const medicalTotal = lossItems.filter(i => i.category === 'MEDICAL_FEE').reduce((s, i) => s + (i.amount || 0), 0);
  const deathTotal = lossItems
    .filter(i => i.category === 'DISABILITY_COMP' || i.category === 'DEATH_COMP')
    .reduce((s, i) => s + (i.amount || 0), 0);
  const propertyTotal = lossItems
    .filter(i => i.category === 'VEHICLE_REPAIR' || i.category === 'PERSONAL_ITEMS' || i.category === 'OTHER_PROPERTY' || i.category === 'VEHICLE_DEPRECIATION' || i.category === 'TOWING_FEE' || i.category === 'LABOR_FEE')
    .reduce((s, i) => s + (i.amount || 0), 0);

  // ─── 管理人专属视图 ───────────────────────────────────────────────────────
  if (role === 'ADMIN') {
    const taskGroups: { key: string; label: string }[] = [
      { key: 'rider_injury', label: '任务列表（骑手人伤）' },
      { key: 'third_injury', label: '任务列表2（三者人伤）' },
      { key: 'third_vehicle', label: '任务列表3（三者车损）' },
      { key: 'third_property', label: '任务列表4（三者物损）' },
    ];
    const adminTaskColumns = [
      { title: '任务ID', dataIndex: 'id', width: 200, ellipsis: true },
      {
        title: '任务类型',
        dataIndex: 'task_type',
        width: 120,
        render: (v: string) => TASK_TYPE_LABEL[v] || v,
      },
      {
        title: '任务状态',
        dataIndex: 'status',
        width: 130,
        render: (v: string) => <Tag color="blue">{TASK_STATUS_LABEL[v] || v}</Tag>,
      },
      { title: '负责人', dataIndex: 'assignee', width: 120, render: (v?: string) => v || '—' },
      { title: '更新时间', dataIndex: 'updated_at', width: 180, render: (v?: string) => v || '—' },
    ];
    return (
      <div style={{ paddingBottom: 80 }}>
        {/* 案件基本信息 */}
        <Card
          bordered={false}
          style={{ marginBottom: 16 }}
          title="案件基本信息"
        >
          <Descriptions bordered column={4} size="small">
            <Descriptions.Item label="案件号"><Text type="secondary">{caseData.case_no}</Text></Descriptions.Item>
            <Descriptions.Item label="骑手姓名">
              {canEditCaseMain
                ? <Input size="small" value={caseData.rider_name} onChange={e => setCaseData(p => ({...p, rider_name: e.target.value}))} style={{ width: 120 }} />
                : <span>{caseData.rider_name}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="归属公司">{caseData.company}</Descriptions.Item>
            <Descriptions.Item label="整案状态">
              <Tag color="blue">{TASK_STATUS_LABEL[caseData.status] || caseData.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标的车">
              {canEditCaseMain
                ? <Select size="small" value={caseData.vehicle_type} options={VEHICLE_TYPE_OPTIONS} onChange={v => setCaseData(p => ({...p, vehicle_type: v, vehicle_label: VEHICLE_TYPE_OPTIONS.find(o => o.value === v)?.label || ''}))} style={{ width: 120 }} />
                : <span>{caseData.vehicle_label}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="险种">
              {canEditCaseMain
                ? <Select size="small" value={caseData.product || undefined} style={{ width: 120 }} onChange={v => setCaseData(p => ({...p, product: v}))}
                    options={[{ value: 'EMPLOYER', label: '雇主责任险' }, { value: 'GROUP_ACCIDENT', label: '团体意外险' }, { value: 'MOTOR_COMP', label: '摩托车综合险' }]} />
                : <span>{caseData.product}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="出险时间">
              {canEditCaseMain
                ? <Input size="small" value={caseData.accident_time} onChange={e => setCaseData(p => ({...p, accident_time: e.target.value}))} style={{ width: 160 }} />
                : <span>{caseData.accident_time}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="出险地点">
              {canEditCaseMain
                ? <Input size="small" value={caseData.accident_location} onChange={e => setCaseData(p => ({...p, accident_location: e.target.value}))} />
                : <span>{caseData.accident_location}</span>}
            </Descriptions.Item>
            <Descriptions.Item label="诉讼状态">
              {caseData.has_litigation ? <Tag color="red">诉讼挂起</Tag> : <Text type="secondary">无</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="调查状态">
              {caseData.investigation_blocking
                ? <Tag color="volcano">调查中（阻塞）</Tag>
                : caseData.has_investigation
                ? <Tag color="default">已完结</Tag>
                : <Text type="secondary">未发起</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="责任比例">
              {canEditCaseMain
                ? <InputNumber size="small" min={0} max={100} value={liabilityRatio}
                    onChange={v => setLiabilityRatio(v ?? 100)}
                    formatter={v => `${v}%`} parser={v => Number((v || '').replace('%', ''))}
                    style={{ width: 80 }} />
                : <span>{liabilityRatio}%</span>}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 整体任务进度列表：三组 */}
        {taskGroups.map(({ key, label }) => {
          const tasks = caseData.tasks.filter(t => t.task_type === key);
          return (
            <Card
              key={key}
              bordered={false}
              style={{ marginBottom: 16 }}
              title={label}
            >
              {tasks.length === 0 ? (
                <Text type="secondary">本案暂无此类型任务</Text>
              ) : (
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={tasks}
                  columns={adminTaskColumns}
                />
              )}
            </Card>
          );
        })}

        {/* 底部按钮功能区 */}
        <div
          style={{
            position: 'fixed', bottom: 0, left: 226, right: 0, height: 64,
            background: '#fff', borderTop: '1px solid #e8e8e8',
            display: 'flex', alignItems: 'center',
            padding: '0 24px', zIndex: 99, boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
          }}
        >
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => {
              const ref = caseData.case_no || id;
              const baseUrl = (import.meta as any).env?.BASE_URL || '/';
              const url = `${window.location.origin}${baseUrl.replace(/\/$/, '/')}#/attachments/${encodeURIComponent(ref || '')}`;
              const opened = window.open(url, 'claim-attachments');
              if (!opened) message.warning('浏览器拦截了附件窗口，请允许弹窗后重试。');
            }}
          >
            附件查看
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 80 }} className="task-detail-dense">
      <style>{`
        .task-detail-dense .ant-card .ant-card-head { min-height: 36px; }
        .task-detail-dense .ant-card .ant-card-head-title { padding: 6px 0; font-size: 13px; }
        .task-detail-dense .ant-card .ant-card-body { padding: 10px; }
        .task-detail-dense .ant-descriptions .ant-descriptions-item-label,
        .task-detail-dense .ant-descriptions .ant-descriptions-item-content { padding-top: 6px; padding-bottom: 6px; }
        .task-detail-dense .ant-table.ant-table-small .ant-table-thead > tr > th,
        .task-detail-dense .ant-table.ant-table-small .ant-table-tbody > tr > td { padding-top: 6px; padding-bottom: 6px; }
        .task-detail-dense .injury-detail-zone .ant-card { margin-bottom: 12px !important; }
        .task-detail-dense .injury-detail-zone .ant-col > div:first-child {
          font-size: 12px !important;
          color: #6b7280 !important;
          margin-bottom: 4px;
          line-height: 1.25;
        }
        .task-detail-dense .injury-detail-zone .ant-input,
        .task-detail-dense .injury-detail-zone .ant-input-number,
        .task-detail-dense .injury-detail-zone .ant-select .ant-select-selector {
          min-height: 30px;
        }
        .task-detail-dense .injury-detail-zone .ant-input-number-input { height: 28px; }
        .task-detail-dense .injury-detail-zone .ant-select-single:not(.ant-select-customize-input) .ant-select-selector {
          height: 30px;
          align-items: center;
        }
        .task-detail-dense .injury-detail-zone .ant-select-single .ant-select-selection-item,
        .task-detail-dense .injury-detail-zone .ant-select-single .ant-select-selection-placeholder {
          line-height: 28px;
        }
        .task-detail-dense .task-picker-modal .ant-modal-header { margin-bottom: 8px; }
        .task-detail-dense .task-picker-modal .ant-modal-body { padding-top: 8px; }
        .task-detail-dense .task-picker-toolbar { margin-bottom: 10px; }
        .task-detail-dense .task-picker-toolbar .ant-select,
        .task-detail-dense .task-picker-toolbar .ant-input { width: 100%; }
        .task-detail-dense .task-picker-modal .ant-table-wrapper { margin-top: 4px; }
        .task-detail-dense .task-picker-modal .ant-table-thead > tr > th {
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .task-detail-dense .field-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
          line-height: 1.25;
        }
        .task-detail-dense .ant-card { margin-bottom: 12px; }
        .task-detail-dense .ant-input-number { width: 100%; }
        .task-detail-dense .ant-form-item { margin-bottom: 12px; }
      `}</style>
      {/* ── 诉讼挂起提示 ── */}
      {caseData.has_litigation && (
        <Alert
          type="error"
          showIcon
          icon={<LockOutlined />}
          message="案件已进入诉讼挂起状态，所有推进操作已冻结，待管理员录入判决后方可恢复"
          style={{ marginBottom: 16 }}
          action={
            role === 'ADMIN' && (
              <Button size="small" danger onClick={() => setJudgmentModal(true)}>
                录入判决
              </Button>
            )
          }
        />
      )}

      {/* ── 调查阻塞提示 ── */}
      {caseData.investigation_blocking && !caseData.has_litigation && (
        <Alert
          type="warning"
          showIcon
          message="案件存在进行中的调查任务，案件推进操作暂被阻塞"
          style={{ marginBottom: 16 }}
          action={
            role === 'ADMIN' && (
              <Popconfirm title="确认调查已完结并解除阻塞？" onConfirm={resolveInvestigation}>
                <Button size="small">确认完结调查</Button>
              </Popconfirm>
            )
          }
        />
      )}

      {/* ── 案件主信息 ── */}
      <Card
        bordered={false}
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <span>案件主信息</span>
            <Tag
              color={TASK_STATUS_COLOR[currentTaskStatus] || 'default'}
              style={{ fontSize: 14, padding: '4px 12px', fontWeight: 600, marginLeft: 8 }}
            >
              {TASK_STATUS_LABEL[currentTaskStatus] || currentTaskStatus}
            </Tag>
          </Space>
        }
        extra={
          <Text type="secondary" style={{ fontSize: 12 }}>
            案件号 {caseData.case_no} · 任务类型 {activeTask ? (TASK_TYPE_LABEL[activeTask.task_type] || activeTask.task_type) : '未分流'}
          </Text>
        }
      >
        <Steps
          current={STATUS_STEP[currentTaskStatus] || 0}
          items={STEP_ITEMS}
          style={{ marginBottom: 20 }}
        />
        <Descriptions bordered column={6} size="small">
          <Descriptions.Item label="案件号"><Text type="secondary">{caseData.case_no}</Text></Descriptions.Item>
          <Descriptions.Item label="骑手">
            {canEditCaseMain
              ? <Input size="small" value={caseData.rider_name} onChange={e => setCaseData(p => ({...p, rider_name: e.target.value}))} style={{ width: 100 }} />
              : <span>{caseData.rider_name}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="当前状态">
            <Tag color={TASK_STATUS_COLOR[currentTaskStatus] || 'default'}>{TASK_STATUS_LABEL[currentTaskStatus] || currentTaskStatus}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="保单号"><Text type="secondary">{policyInfo.policy_no}</Text></Descriptions.Item>
          <Descriptions.Item label="保险公司">{policyInfo.insurer}</Descriptions.Item>
          <Descriptions.Item label="保单名称">{policyInfo.policy_name}</Descriptions.Item>
          <Descriptions.Item label="投保人">{policyInfo.applicant}</Descriptions.Item>
          <Descriptions.Item label="投保人证件号">{policyInfo.applicant_id_no}</Descriptions.Item>
          <Descriptions.Item label="被保险人">{policyInfo.insured}</Descriptions.Item>
          <Descriptions.Item label="保单生效时间">{policyInfo.start_date}</Descriptions.Item>
          <Descriptions.Item label="保单失效时间">{policyInfo.end_date}</Descriptions.Item>
          <Descriptions.Item label="标的车">
            {canEditCaseMain
              ? <Select size="small" value={caseData.vehicle_type} options={VEHICLE_TYPE_OPTIONS} onChange={v => setCaseData(p => ({...p, vehicle_type: v, vehicle_label: VEHICLE_TYPE_OPTIONS.find(o => o.value === v)?.label || ''}))} style={{ width: 120 }} />
              : <span>{caseData.vehicle_label}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="出险时间">
            {canEditCaseMain
              ? <Input size="small" value={caseData.accident_time} onChange={e => setCaseData(p => ({...p, accident_time: e.target.value}))} style={{ width: 160 }} />
              : <span>{caseData.accident_time}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="出险地点">
            {canEditCaseMain
              ? <Input size="small" value={caseData.accident_location} onChange={e => setCaseData(p => ({...p, accident_location: e.target.value}))} />
              : <span>{caseData.accident_location}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="险种">
            {canEditCaseMain
              ? <Select size="small" value={caseData.product || undefined} style={{ width: 120 }} onChange={v => setCaseData(p => ({...p, product: v}))}
                  options={[{ value: 'EMPLOYER', label: '雇主责任险' }, { value: 'GROUP_ACCIDENT', label: '团体意外险' }, { value: 'MOTOR_COMP', label: '摩托车综合险' }]} />
              : <span>{caseData.product}</span>}
          </Descriptions.Item>
          <Descriptions.Item label="诉讼状态">
            {caseData.has_litigation ? <Tag color="red">诉讼挂起</Tag> : <Text type="secondary">无</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="调查状态">
            {caseData.investigation_blocking
              ? <Tag color="volcano">调查中（阻塞）</Tag>
              : caseData.has_investigation
              ? <Tag color="default">已完结</Tag>
              : <Text type="secondary">未发起</Text>}
          </Descriptions.Item>
          <Descriptions.Item label="责任比例">
            {(isSurveyor || canEditCaseMain) ? (
              <InputNumber
                size="small"
                min={0} max={100} value={liabilityRatio}
                onChange={(v) => setLiabilityRatio(v ?? 100)}
                formatter={(v) => `${v}%`}
                parser={(v) => Number((v || '').replace('%', ''))}
                style={{ width: 90 }}
              />
            ) : (
              <Text>{liabilityRatio}%</Text>
            )}
          </Descriptions.Item>
          {isRiderInjuryTask && (
            <Descriptions.Item label="承保险种">
              {canEditSurveyForm ? (
                <Select
                  value={riderInjury.insurance_type || undefined}
                  style={{ width: 160 }}
                  placeholder="请选择险种"
                  options={[{ value: 'employer', label: '雇主责任险' }, { value: 'accident', label: '意外险' }]}
                  onChange={v => setRiderInjury(p => ({ ...p, insurance_type: v, disability_level: '' }))}
                />
              ) : (
                <Tag color={riderInjury.insurance_type === 'employer' ? 'volcano' : 'geekblue'}>
                  {riderInjury.insurance_type === 'employer' ? '雇主责任险' : riderInjury.insurance_type === 'accident' ? '意外险' : '—'}
                </Tag>
              )}
            </Descriptions.Item>
          )}
        </Descriptions>
      </Card>

      {isCustomerSplitPending && (
        <Card bordered={false} style={{ marginBottom: 16 }} title="案件分流信息">
          <Checkbox.Group
            value={splitSelection}
            onChange={(vals) => setSplitSelection(vals as string[])}
          >
            <Space direction="vertical">
              <Checkbox value="rider_injury">骑手人伤</Checkbox>
              <Checkbox value="third_injury">三者人伤</Checkbox>
              <Checkbox value="third_vehicle">三者车损</Checkbox>
              <Checkbox value="third_property">三者物损（财产/物品）</Checkbox>
            </Space>
          </Checkbox.Group>
        </Card>
      )}

      {isInjuryTask && (
        <>
          <style>{`.injury-detail-zone .ant-select{width:100% !important;}`}</style>
          <div className="injury-detail-zone">
          <Card bordered={false} style={{ marginBottom: 16 }} title="损失选择">
            <Checkbox.Group
              options={LOSS_SELECT_OPTIONS}
              value={selectedLossTypes}
              onChange={(vals) => handleLossTypeChange(vals as string[])}
            />
          </Card>

          <Card bordered={false} style={{ marginBottom: 16 }} title="事故信息">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}><div className="field-label">出险人姓名</div><Input disabled={!canEditSurveyForm} value={accidentForm.claimant_name} onChange={(e) => setAccidentForm(p => ({ ...p, claimant_name: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">出险人证件号</div><Input disabled={!canEditSurveyForm} value={accidentForm.claimant_id_no} onChange={(e) => setAccidentForm(p => ({ ...p, claimant_id_no: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">证件类型</div><Select disabled={!canEditSurveyForm} value={accidentForm.claimant_id_type} options={[{ value: '身份证', label: '身份证' }, { value: '户口页', label: '户口页' }, { value: '驾驶证', label: '驾驶证' }]} onChange={(v) => setAccidentForm(p => ({ ...p, claimant_id_type: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">联系方式</div><Input disabled={!canEditSurveyForm} value={accidentForm.phone} onChange={(e) => setAccidentForm(p => ({ ...p, phone: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">驾驶工具</div><Select disabled={!canEditSurveyForm} value={accidentForm.vehicle_tool} options={[{ value: '电动车', label: '电动车' }, { value: '超标电动车', label: '超标电动车' }, { value: '摩托车', label: '摩托车' }]} onChange={(v) => setAccidentForm(p => ({ ...p, vehicle_tool: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">关联订单号</div><Input disabled={!canEditSurveyForm} value={accidentForm.order_no} onChange={(e) => setAccidentForm(p => ({ ...p, order_no: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">事故类型</div><Select disabled={!canEditSurveyForm} value={accidentForm.accident_type} options={[{ value: '单方事故', label: '单方事故' }, { value: '双方事故', label: '双方事故' }, { value: '多方事故', label: '多方事故' }]} onChange={(v) => setAccidentForm(p => ({ ...p, accident_type: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">责任比例</div><Select disabled={!canEditSurveyForm} value={accidentForm.liability_level} options={[{ value: '全责', label: '全责' }, { value: '主责', label: '主责' }, { value: '同责', label: '同责' }, { value: '次责', label: '次责' }, { value: '无责', label: '无责' }]} onChange={(v) => setAccidentForm(p => ({ ...p, liability_level: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">事故时间</div><Input type="datetime-local" disabled={!canEditSurveyForm} value={accidentForm.accident_time} onChange={(e) => setAccidentForm(p => ({ ...p, accident_time: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">事故省</div><Select disabled={!canEditSurveyForm} allowClear value={accidentForm.province || undefined} options={provinceOptions.map(v => ({ value: v, label: v }))} onChange={(v) => setAccidentForm(p => ({ ...p, province: v || '', city: '', district: '' }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">事故市</div><Select disabled={!canEditSurveyForm} allowClear value={accidentForm.city || undefined} options={cityOptions.map(v => ({ value: v, label: v }))} onChange={(v) => setAccidentForm(p => ({ ...p, city: v || '', district: '' }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">事故区（县）</div><Select disabled={!canEditSurveyForm} allowClear value={accidentForm.district || undefined} options={districtOptions.map(v => ({ value: v, label: v }))} onChange={(v) => setAccidentForm(p => ({ ...p, district: v || '' }))} /></Col>
              <Col xs={24} md={16}><div className="field-label">详细地点</div><Input disabled={!canEditSurveyForm} value={accidentForm.address_detail} onChange={(e) => setAccidentForm(p => ({ ...p, address_detail: e.target.value }))} /></Col>
              <Col xs={24} md={24}><div className="field-label">事故详细描述</div><Input.TextArea rows={2} disabled={!canEditSurveyForm} value={accidentForm.accident_desc} onChange={(e) => setAccidentForm(p => ({ ...p, accident_desc: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">是否已报警</div><Switch disabled={!canEditSurveyForm} checked={accidentForm.has_alarm} onChange={(v) => setAccidentForm(p => ({ ...p, has_alarm: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">是否有驾照</div><Switch disabled={!canEditSurveyForm} checked={accidentForm.has_driver_license} onChange={(v) => setAccidentForm(p => ({ ...p, has_driver_license: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">是否有行驶证</div><Switch disabled={!canEditSurveyForm} checked={accidentForm.has_vehicle_license} onChange={(v) => setAccidentForm(p => ({ ...p, has_vehicle_license: v }))} /></Col>
            </Row>
          </Card>

          <Card bordered={false} style={{ marginBottom: 16 }} title={`伤者信息（${isThirdInjuryTask ? '三者' : '骑手'}）`}>
            <Row gutter={[12, 12]}>
              <Col xs={24} md={8}><div className="field-label">伤者姓名</div><Input disabled={!canEditSurveyForm} value={injuredDetail.name} onChange={(e) => setInjuredDetail(p => ({ ...p, name: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">伤者联系方式</div><Input disabled={!canEditSurveyForm} value={injuredDetail.phone} onChange={(e) => setInjuredDetail(p => ({ ...p, phone: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">户口性质</div><Select disabled={!canEditSurveyForm} value={injuredDetail.household_type || undefined} options={[{ value: '城镇', label: '城镇' }, { value: '农村', label: '农村' }]} onChange={(v) => setInjuredDetail(p => ({ ...p, household_type: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">身份证号码</div><Input disabled={!canEditSurveyForm} value={injuredDetail.id_no} onChange={(e) => setInjuredDetail(p => ({ ...p, id_no: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">出生日期</div><Input type="date" disabled={!canEditSurveyForm} value={injuredDetail.birth_date} onChange={(e) => {
                const birth = e.target.value;
                const age = birth ? Math.max(0, new Date().getFullYear() - new Date(birth).getFullYear()) : 0;
                setInjuredDetail(p => ({ ...p, birth_date: birth, age }));
              }} /></Col>
              <Col xs={24} md={8}><div className="field-label">年龄</div><InputNumber disabled value={injuredDetail.age} style={{ width: '100%' }} /></Col>
              <Col xs={24} md={8}><div className="field-label">性别</div><Select disabled={!canEditSurveyForm} value={injuredDetail.gender} options={[{ value: '男', label: '男' }, { value: '女', label: '女' }]} onChange={(v) => setInjuredDetail(p => ({ ...p, gender: v }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">户籍地</div><Input disabled={!canEditSurveyForm} value={injuredDetail.domicile} onChange={(e) => setInjuredDetail(p => ({ ...p, domicile: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">居住地</div><Input disabled={!canEditSurveyForm} value={injuredDetail.residence} onChange={(e) => setInjuredDetail(p => ({ ...p, residence: e.target.value }))} /></Col>
              <Col xs={24} md={24}><div className="field-label">详细地址</div><Input disabled={!canEditSurveyForm} value={injuredDetail.address_detail} onChange={(e) => setInjuredDetail(p => ({ ...p, address_detail: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">联系人姓名</div><Input disabled={!canEditSurveyForm} value={injuredDetail.contact_name} onChange={(e) => setInjuredDetail(p => ({ ...p, contact_name: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">与伤者关系</div><Input disabled={!canEditSurveyForm} value={injuredDetail.relation} onChange={(e) => setInjuredDetail(p => ({ ...p, relation: e.target.value }))} /></Col>
              <Col xs={24} md={8}><div className="field-label">联系人电话</div><Input disabled={!canEditSurveyForm} value={injuredDetail.contact_phone} onChange={(e) => setInjuredDetail(p => ({ ...p, contact_phone: e.target.value }))} /></Col>
            </Row>
          </Card>

          <Card bordered={false} style={{ marginBottom: 16 }} title="工作信息">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={6}><div className="field-label">职业类型</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={workForm.job_type} options={[{ value: '全职', label: '全职' }, { value: '兼职', label: '兼职' }]} onChange={(v) => setWorkForm(p => ({ ...p, job_type: v }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">所属行业</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={workForm.industry || undefined} options={[{ value: '外卖配送', label: '外卖配送' }, { value: '快递物流', label: '快递物流' }, { value: '制造业', label: '制造业' }, { value: '服务业', label: '服务业' }, { value: '其他', label: '其他' }]} onChange={(v) => setWorkForm(p => ({ ...p, industry: v }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">工作年限</div><InputNumber disabled={!canEditSurveyForm} min={0} value={workForm.years} style={{ width: '100%' }} onChange={(v) => setWorkForm(p => ({ ...p, years: v || 0 }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">收入日标准</div><InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={workForm.day_income} style={{ width: '100%' }} onChange={(v) => {
                const income = v || 0;
                setWorkForm(p => ({ ...p, day_income: income }));
                setInjurySettlementRows(prev => prev.map(x => x.id === 'settle-lostwork' ? { ...x, standard: income } : x));
              }} addonAfter="元/日" /></Col>
              <Col xs={24} md={12}><div className="field-label">工作单位</div><Input disabled={!canEditSurveyForm} value={workForm.company} onChange={(e) => setWorkForm(p => ({ ...p, company: e.target.value }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">单位联系人电话</div><Input disabled={!canEditSurveyForm} value={workForm.company_contact_phone} onChange={(e) => setWorkForm(p => ({ ...p, company_contact_phone: e.target.value }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">单位地址</div><Input disabled={!canEditSurveyForm} value={workForm.company_address} onChange={(e) => setWorkForm(p => ({ ...p, company_address: e.target.value }))} /></Col>
            </Row>
          </Card>

          <Card bordered={false} style={{ marginBottom: 16 }} title="护理人信息">
            <Row gutter={[12, 12]}>
              <Col xs={24} md={6}><div className="field-label">职业类型</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={nursingForm.job_type} options={[{ value: '全职', label: '全职' }, { value: '兼职', label: '兼职' }]} onChange={(v) => setNursingForm(p => ({ ...p, job_type: v }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">所属行业</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={nursingForm.industry || undefined} options={[{ value: '护工', label: '护工' }, { value: '家属护理', label: '家属护理' }, { value: '服务业', label: '服务业' }, { value: '其他', label: '其他' }]} onChange={(v) => setNursingForm(p => ({ ...p, industry: v }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">工作年限</div><InputNumber disabled={!canEditSurveyForm} min={0} value={nursingForm.years} style={{ width: '100%' }} onChange={(v) => setNursingForm(p => ({ ...p, years: v || 0 }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">收入日标准</div><InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={nursingForm.day_income} style={{ width: '100%' }} onChange={(v) => {
                const income = v || 0;
                setNursingForm(p => ({ ...p, day_income: income }));
                setInjurySettlementRows(prev => prev.map(x => x.id === 'settle-nursing' ? { ...x, standard: income } : x));
              }} addonAfter="元/日" /></Col>
              <Col xs={24} md={12}><div className="field-label">工作单位</div><Input disabled={!canEditSurveyForm} value={nursingForm.company} onChange={(e) => setNursingForm(p => ({ ...p, company: e.target.value }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">单位联系人电话</div><Input disabled={!canEditSurveyForm} value={nursingForm.company_contact_phone} onChange={(e) => setNursingForm(p => ({ ...p, company_contact_phone: e.target.value }))} /></Col>
              <Col xs={24} md={6}><div className="field-label">单位地址</div><Input disabled={!canEditSurveyForm} value={nursingForm.company_address} onChange={(e) => setNursingForm(p => ({ ...p, company_address: e.target.value }))} /></Col>
            </Row>
          </Card>

          <Card
            bordered={false}
            style={{ marginTop: 16, marginBottom: 16 }}
            title="就诊医院信息"
            extra={canEditSurveyForm && <Button size="small" onClick={() => setHospitalPickerOpen(true)}>添加住院信息</Button>}
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={hospitalRecords}
              columns={[
                { title: '就诊医院名称', dataIndex: 'hospital_name' },
                { title: '统一社会信用代码', dataIndex: 'credit_code', width: 220 },
                {
                  title: '就诊科室',
                  dataIndex: 'dept',
                  width: 150,
                  render: (_: any, r: HospitalRecord) => <Input disabled={!canEditSurveyForm} value={r.dept} onChange={(e) => setHospitalRecords(prev => prev.map(x => x.id === r.id ? { ...x, dept: e.target.value } : x))} />,
                },
                {
                  title: '入院时间',
                  dataIndex: 'admit_date',
                  width: 150,
                  render: (_: any, r: HospitalRecord) => <Input type="date" disabled={!canEditSurveyForm} value={r.admit_date} onChange={(e) => {
                    const admit = e.target.value;
                    setHospitalRecords(prev => prev.map(x => x.id === r.id ? { ...x, admit_date: admit, hospital_days: calcHospitalDays(admit, x.discharge_date) } : x));
                  }} />,
                },
                {
                  title: '出院时间',
                  dataIndex: 'discharge_date',
                  width: 150,
                  render: (_: any, r: HospitalRecord) => <Input type="date" disabled={!canEditSurveyForm} value={r.discharge_date} onChange={(e) => {
                    const discharge = e.target.value;
                    setHospitalRecords(prev => prev.map(x => x.id === r.id ? { ...x, discharge_date: discharge, hospital_days: calcHospitalDays(x.admit_date, discharge) } : x));
                  }} />,
                },
                { title: '住院天数', dataIndex: 'hospital_days', width: 90 },
                {
                  title: '操作',
                  width: 70,
                  render: (_: any, r: HospitalRecord) => canEditSurveyForm ? <Button type="link" danger size="small" onClick={() => setHospitalRecords(prev => prev.filter(x => x.id !== r.id))}>删除</Button> : null,
                },
              ]}
            />
          </Card>

          <Card
            bordered={false}
            style={{ marginBottom: 16 }}
            title="诊断信息"
            extra={canEditSurveyForm && <Button size="small" onClick={() => {
              // 每次打开都重置筛选 & 分页，避免上次筛选残留
              setDiagFilter({ level1: '', level2: '', level3: '', level4: '', keyword: '' });
              setDiagPage(1);
              setDiagPickerOpen(true);
            }}>添加伤情信息</Button>}
          >
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={diagnosisRecords}
              columns={[
                {
                  title: 'ICD编码',
                  dataIndex: 'icd_code',
                  width: 130,
                  render: (_: any, r: DiagnosisRecord) => r.icd_code || r.injury_diagram || '-',
                },
                {
                  title: '一级筛选名称',
                  dataIndex: 'level1_name',
                  width: 240,
                  ellipsis: true,
                  render: (_: any, r: DiagnosisRecord) => r.level1_name || r.injury_part1 || '-',
                },
                {
                  title: '二级筛选名称',
                  dataIndex: 'level2_name',
                  width: 200,
                  ellipsis: true,
                  render: (_: any, r: DiagnosisRecord) => r.level2_name || r.injury_part2 || '-',
                },
                {
                  title: '三级筛选名称',
                  dataIndex: 'level3_name',
                  width: 200,
                  ellipsis: true,
                  render: (_: any, r: DiagnosisRecord) => r.level3_name || r.injury_device || '-',
                },
                { title: '临床诊断', dataIndex: 'main_diagnosis', ellipsis: true },
                {
                  title: '治疗方式',
                  dataIndex: 'treatment',
                  width: 140,
                  render: (_: any, r: DiagnosisRecord) => (
                    <Select
                      style={{ width: '100%' }}
                      disabled={!canEditSurveyForm}
                      value={r.treatment || '保守治疗'}
                      options={[{ value: '保守治疗', label: '保守治疗' }, { value: '手术治疗', label: '手术治疗' }]}
                      onChange={(v) => setDiagnosisRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, treatment: v } : x)))}
                    />
                  ),
                },
                {
                  title: '操作',
                  width: 70,
                  render: (_: any, r: DiagnosisRecord) => canEditSurveyForm ? <Button type="link" danger size="small" onClick={() => setDiagnosisRecords(prev => prev.filter(x => x.id !== r.id))}>删除</Button> : null,
                },
              ]}
            />
          </Card>

          {selectedLossTypes.includes('医疗费用') && (
          <Card bordered={false} style={{ marginBottom: 16 }} title="医疗费信息">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={medicalFeeRecords}
              columns={[
                { title: '医疗费定损金额', dataIndex: 'inpatient_fee', width: 170, render: (v: number) => <Text strong style={{ color: '#cf1322' }}>¥{(v || 0).toFixed(2)}</Text> },
                { title: '发票金额', dataIndex: 'invoice_amount', render: (_: any, r: MedicalFeeRecord) => <InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={r.invoice_amount} style={{ width: '100%' }} onChange={(v) => setMedicalFeeRecords(prev => prev.map(x => x.id === r.id ? { ...x, invoice_amount: v || 0, inpatient_fee: Math.max(0, (v || 0) - (x.non_insured_drug || 0) - (x.deduction || 0)) } : x))} /> },
                { title: '医保内用药金额', dataIndex: 'insured_drug', render: (_: any, r: MedicalFeeRecord) => <InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={r.insured_drug} style={{ width: '100%' }} onChange={(v) => setMedicalFeeRecords(prev => prev.map(x => x.id === r.id ? { ...x, insured_drug: v || 0 } : x))} /> },
                { title: '医保外用药金额', dataIndex: 'non_insured_drug', render: (_: any, r: MedicalFeeRecord) => <InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={r.non_insured_drug} style={{ width: '100%' }} onChange={(v) => setMedicalFeeRecords(prev => prev.map(x => x.id === r.id ? { ...x, non_insured_drug: v || 0, inpatient_fee: Math.max(0, (x.invoice_amount || 0) - (v || 0) - (x.deduction || 0)) } : x))} /> },
                { title: '医保扣减金额', dataIndex: 'deduction', render: (_: any, r: MedicalFeeRecord) => <InputNumber disabled={!canEditSurveyForm} min={0} precision={2} value={r.deduction} style={{ width: '100%' }} onChange={(v) => setMedicalFeeRecords(prev => prev.map(x => x.id === r.id ? { ...x, deduction: v || 0, inpatient_fee: Math.max(0, (x.invoice_amount || 0) - (x.non_insured_drug || 0) - (v || 0)) } : x))} /> },
              ]}
            />
          </Card>

          )}

          {selectedLossTypes.includes('伤残赔偿金') && (
              <Card bordered={false} style={{ marginBottom: 16 }} title="伤残信息">
                <Row gutter={[12, 12]}>
                  <Col span={12}><div className="field-label">鉴定方式</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={disabilityForm.appraisal_method} options={[{ value: '自鉴定', label: '自鉴定' }, { value: '委托鉴定', label: '委托鉴定' }]} onChange={(v) => setDisabilityForm(p => ({ ...p, appraisal_method: v }))} /></Col>
                  <Col span={12}><div className="field-label">鉴定机构</div><Input disabled={!canEditSurveyForm} value={disabilityForm.appraisal_org} onChange={(e) => setDisabilityForm(p => ({ ...p, appraisal_org: e.target.value }))} /></Col>
                  <Col span={24}><div className="field-label">鉴定标准</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={disabilityForm.appraisal_standard || undefined} options={[{ value: '工伤伤残鉴定标准', label: '工伤伤残鉴定标准' }, { value: '人伤保险伤残鉴定标准', label: '人伤保险伤残鉴定标准' }, { value: '人体损伤致残程度分级标准', label: '人体损伤致残程度分级标准' }]} onChange={(v) => setDisabilityForm(p => ({ ...p, appraisal_standard: v, disability_level: '', disability_clause: '' }))} /></Col>
                  <Col span={12}><div className="field-label">伤残等级</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={disabilityForm.disability_level || undefined} options={['一级','二级','三级','四级','五级','六级','七级','八级','九级','十级'].map(v => ({ value: v, label: v }))} onChange={(v) => {
                    const clause = disabilityClauseMap[disabilityForm.appraisal_standard]?.[v] || '';
                    setDisabilityForm(p => ({ ...p, disability_level: v, disability_clause: clause }));
                  }} /></Col>
                  <Col span={12}><div className="field-label">关联伤情</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={disabilityForm.related_diagnosis_id || undefined} options={diagnosisRecords.map(x => ({ value: x.id, label: `${x.injury_part1}-${x.main_diagnosis}` }))} onChange={(v) => setDisabilityForm(p => ({ ...p, related_diagnosis_id: v }))} /></Col>
                  <Col span={24}><div className="field-label">伤残条款</div><Input value={disabilityForm.disability_clause} disabled /></Col>
                </Row>
              </Card>
          )}

          {selectedLossTypes.includes('死亡赔偿') && (
              <Card bordered={false} style={{ marginBottom: 16 }} title="死亡信息">
                <Row gutter={[12, 12]}>
                  <Col span={12}><div className="field-label">死者姓名</div><Input disabled={!canEditSurveyForm} value={deathForm.deceased_name} onChange={(e) => setDeathForm(p => ({ ...p, deceased_name: e.target.value }))} /></Col>
                  <Col span={12}><div className="field-label">死亡赔偿金年限</div><InputNumber disabled={!canEditSurveyForm} min={0} max={30} value={deathForm.compensation_years} style={{ width: '100%' }} onChange={(v) => setDeathForm(p => ({ ...p, compensation_years: v || 0 }))} /></Col>
                  <Col span={12}><div className="field-label">是否尸检</div><Switch disabled={!canEditSurveyForm} checked={deathForm.autopsy} onChange={(v) => setDeathForm(p => ({ ...p, autopsy: v }))} /></Col>
                  <Col span={12}><div className="field-label">致死伤情</div><Select style={fullSelectStyle} disabled={!canEditSurveyForm} value={deathForm.fatal_diagnosis_id || undefined} options={diagnosisRecords.map(x => ({ value: x.id, label: `${x.injury_part1}-${x.main_diagnosis}` }))} onChange={(v) => setDeathForm(p => ({ ...p, fatal_diagnosis_id: v }))} /></Col>
                </Row>
              </Card>
          )}

          <Modal
            title="添加住院信息"
            open={hospitalPickerOpen}
            onCancel={() => setHospitalPickerOpen(false)}
            footer={null}
            className="task-picker-modal"
            width="min(1320px, 96vw)"
            bodyStyle={{ height: '68vh', overflow: 'auto' }}
          >
            <div className="task-picker-toolbar">
              <Row gutter={[10, 10]}>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="省"
                    value={hospitalFilter.province || undefined}
                    options={provinceOptions.map(v => ({ value: v, label: v }))}
                    onChange={(v) => { setHospitalPage(1); setHospitalFilter({ province: v || '', city: '', district: '', keyword: '' }); }}
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="市"
                    value={hospitalFilter.city || undefined}
                    options={cityOptions.map(v => ({ value: v, label: v }))}
                    onChange={(v) => { setHospitalPage(1); setHospitalFilter({ ...hospitalFilter, city: v || '', district: '', keyword: '' }); }}
                  />
                </Col>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="区县"
                    value={hospitalFilter.district || undefined}
                    options={districtOptions.map(v => ({ value: v, label: v }))}
                    onChange={(v) => { setHospitalPage(1); setHospitalFilter({ ...hospitalFilter, district: v || '' }); }}
                  />
                </Col>
                <Col xs={24} sm={24} md={24} lg={6}>
                  <Input
                    placeholder="医院名称/信用代码模糊查询"
                    value={hospitalFilter.keyword}
                    onChange={(e) => { setHospitalPage(1); setHospitalFilter({ ...hospitalFilter, keyword: e.target.value }); }}
                  />
                </Col>
              </Row>
            </div>
            <Table
              size="small"
              rowKey="id"
              loading={hospitalLoading}
              sticky
              scroll={{ x: 1100, y: 420 }}
              pagination={{
                current: hospitalPage,
                pageSize: hospitalPageSize,
                total: hospitalTotal,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page, pageSize) => {
                  setHospitalPage(page);
                  setHospitalPageSize(pageSize || 20);
                },
              }}
              dataSource={filteredHospitals}
              locale={{ emptyText: hospitalLoading ? '正在查询医院...' : '暂无匹配医院数据' }}
              columns={[
                { title: '医院名称', dataIndex: 'name', width: 320, ellipsis: true },
                { title: '统一社会信用代码', dataIndex: 'credit_code', width: 220 },
                { title: '省', dataIndex: 'province', width: 140 },
                { title: '市', dataIndex: 'city', width: 130 },
                { title: '区县', dataIndex: 'district', width: 130 },
                {
                  title: '操作',
                  width: 90,
                  render: (_: any, r: HospitalSearchItem) => (
                    <Button type="link" size="small" onClick={() => {
                      setHospitalRecords(prev => [...prev, {
                        id: `${Date.now()}`,
                        hospital_name: r.name,
                        org_score: '',
                        credit_code: r.credit_code,
                        dept: '',
                        inpatient_no: '',
                        admit_date: '',
                        discharge_date: '',
                        hospital_days: 0,
                      }]);
                      setHospitalPickerOpen(false);
                    }}>
                      选择
                    </Button>
                  ),
                },
              ]}
            />
          </Modal>

          <Modal
            title="添加伤情信息"
            open={diagPickerOpen}
            onCancel={() => setDiagPickerOpen(false)}
            footer={null}
            className="task-picker-modal"
            width="min(1320px, 96vw)"
            bodyStyle={{ height: '68vh', overflow: 'auto' }}
          >
            <div className="task-picker-toolbar">
              <Row gutter={[10, 10]}>
                <Col xs={24} sm={12} md={12} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="一级：章的名称"
                    value={diagFilter.level1 || undefined}
                    options={diagLevel1Options.map(v => ({ value: v, label: v }))}
                    onChange={(v) => {
                      setDiagPage(1);
                      setDiagFilter({ level1: v || '', level2: '', level3: '', level4: '', keyword: '' });
                    }}
                  />
                </Col>
                <Col xs={24} sm={12} md={12} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="二级：节名称"
                    value={diagFilter.level2 || undefined}
                    options={diagLevel2Options.map(v => ({ value: v, label: v }))}
                    onChange={(v) => {
                      setDiagPage(1);
                      setDiagFilter({ ...diagFilter, level2: v || '', level3: '', level4: '', keyword: '' });
                    }}
                  />
                </Col>
                <Col xs={24} sm={12} md={12} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="三级：类目名称"
                    value={diagFilter.level3 || undefined}
                    options={diagLevel3Options.map(v => ({ value: v, label: v }))}
                    onChange={(v) => {
                      setDiagPage(1);
                      setDiagFilter({ ...diagFilter, level3: v || '', level4: '', keyword: '' });
                    }}
                  />
                </Col>
                <Col xs={24} sm={12} md={12} lg={6}>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    placeholder="四级：诊断名称"
                    value={diagFilter.level4 || undefined}
                    options={diagLevel4Options.map(v => ({ value: v, label: v }))}
                    onChange={(v) => {
                      setDiagPage(1);
                      setDiagFilter({ ...diagFilter, level4: v || '' });
                    }}
                  />
                </Col>
                <Col xs={24} sm={24} md={24} lg={10}>
                  <Input
                    placeholder="模糊筛选（编码/诊断名称）"
                    value={diagFilter.keyword}
                    onChange={(e) => {
                      setDiagPage(1);
                      setDiagFilter({ ...diagFilter, keyword: e.target.value });
                    }}
                  />
                </Col>
              </Row>
            </div>
            <Table
              size="small"
              rowKey="id"
              sticky
              scroll={{ x: 1100, y: 420 }}
              pagination={{
                current: diagPage,
                pageSize: diagPageSize,
                total: diagTotal,
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page, pageSize) => {
                  setDiagPage(page);
                  setDiagPageSize(pageSize || 20);
                },
              }}
              loading={diagLoading}
              dataSource={filteredDiagnosisOptions}
              locale={{ emptyText: diagLoading ? '正在查询 ICD-10...' : '未查询到 ICD-10 诊断，请先导入数据' }}
              columns={[
                { title: 'ICD编码', dataIndex: 'code', width: 130 },
                { title: '一级筛选名称', dataIndex: 'level1', width: 240, ellipsis: true },
                { title: '二级筛选名称', dataIndex: 'level2', width: 200, ellipsis: true },
                { title: '三级筛选名称', dataIndex: 'level3', width: 200, ellipsis: true },
                { title: '临床诊断', dataIndex: 'diagnosis', ellipsis: true },
                { title: '治疗方式', dataIndex: 'treatment', width: 140, render: (v: string) => v || '保守治疗' },
                {
                  title: '操作',
                  width: 90,
                  render: (_: any, r: DiagnosisOption) => (
                    <Button type="link" size="small" onClick={() => {
                      setDiagnosisRecords(prev => [...prev, {
                        id: `${Date.now()}`,
                        icd_code: r.code,
                        level1_name: r.level1,
                        level2_name: r.level2,
                        level3_name: r.level3,
                        level4_name: r.diagnosis,
                        injury_part1: r.level1,
                        injury_part2: r.level2,
                        injury_device: r.level3,
                        injury_diagram: r.code,
                        treatment: r.treatment || '保守治疗',
                        main_diagnosis: r.diagnosis,
                        report_disease: '',
                      }]);
                      setDiagPickerOpen(false);
                    }}>
                      选择
                    </Button>
                  ),
                },
              ]}
            />
          </Modal>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ICD-10 伤情描述（人伤任务共用，骑手/三者均显示）
       ══════════════════════════════════════════════════════════════════ */}
      {false && isInjuryTask && (() => {
        const D = !canEditSurveyForm;

        // 常见外伤 ICD-10 编码（节选，实际可接后端搜索接口）
        const ICD10_OPTIONS = [
          { value: 'S00', label: 'S00 — 头部浅表损伤' },
          { value: 'S01', label: 'S01 — 头部开放性伤口' },
          { value: 'S02', label: 'S02 — 颅骨和面骨骨折' },
          { value: 'S06', label: 'S06 — 颅内损伤' },
          { value: 'S09', label: 'S09 — 头部其他和未特指损伤' },
          { value: 'S10', label: 'S10 — 颈部浅表损伤' },
          { value: 'S12', label: 'S12 — 颈椎骨折' },
          { value: 'S14', label: 'S14 — 颈部神经和脊髓损伤' },
          { value: 'S20', label: 'S20 — 胸部浅表损伤' },
          { value: 'S22', label: 'S22 — 肋骨、胸骨和胸椎骨折' },
          { value: 'S27', label: 'S27 — 胸腔内器官损伤' },
          { value: 'S30', label: 'S30 — 腹部、腰部和骨盆浅表损伤' },
          { value: 'S32', label: 'S32 — 腰椎和骨盆骨折' },
          { value: 'S36', label: 'S36 — 腹部器官损伤' },
          { value: 'S40', label: 'S40 — 肩和上臂浅表损伤' },
          { value: 'S42', label: 'S42 — 肩和上臂骨折' },
          { value: 'S50', label: 'S50 — 前臂浅表损伤' },
          { value: 'S52', label: 'S52 — 前臂骨折' },
          { value: 'S60', label: 'S60 — 腕和手浅表损伤' },
          { value: 'S62', label: 'S62 — 腕和手骨折' },
          { value: 'S70', label: 'S70 — 髋和大腿浅表损伤' },
          { value: 'S72', label: 'S72 — 股骨骨折' },
          { value: 'S79', label: 'S79 — 髋和大腿其他损伤' },
          { value: 'S80', label: 'S80 — 膝和小腿浅表损伤' },
          { value: 'S82', label: 'S82 — 小腿骨折含踝骨折' },
          { value: 'S86', label: 'S86 — 膝以下肌肉和肌腱损伤' },
          { value: 'S92', label: 'S92 — 足骨折' },
          { value: 'T07', label: 'T07 — 多部位损伤' },
          { value: 'T14', label: 'T14 — 未特指部位身体损伤' },
        ];

        const filteredICD = ICD10_OPTIONS.filter(o =>
          !injuryDesc.icd_input ||
          o.value.toLowerCase().includes(injuryDesc.icd_input.toLowerCase()) ||
          o.label.includes(injuryDesc.icd_input)
        );

        return (
          <Card
            size="small"
            title={<Space><MedicineBoxOutlined style={{ color: '#cf1322' }} /><b>伤情描述（ICD-10）</b></Space>}
            style={{ marginBottom: 16 }}
          >
            <Row gutter={[12, 12]}>
              <Col span={10}>
                <div className="field-label">损伤诊断（ICD-10 检索）</div>
                <AutoComplete
                  disabled={D}
                  style={{ width: '100%' }}
                  value={injuryDesc.icd_input || (injuryDesc.icd_code ? `${injuryDesc.icd_code} — ${injuryDesc.icd_name}` : '')}
                  options={filteredICD}
                  filterOption={false}
                  placeholder="输入编码或关键词搜索，如 S72 / 骨折"
                  onChange={v => setID({ icd_input: v, icd_code: '', icd_name: '' })}
                  onSelect={(val: string, opt: any) => {
                    const parts = opt.label.split(' — ');
                    setID({ icd_input: opt.label, icd_code: val, icd_name: parts[1] || '' });
                  }}
                  allowClear
                  onClear={() => setID({ icd_input: '', icd_code: '', icd_name: '' })}
                />
              </Col>
              <Col span={7}>
                <div className="field-label">损伤性质</div>
                <Select
                  disabled={D}
                  style={{ width: '100%' }}
                  placeholder="请选择"
                  value={injuryDesc.injury_nature || undefined}
                  onChange={v => setID({ injury_nature: v })}
                  options={[
                    { value: '骨折', label: '骨折' },
                    { value: '脱位', label: '脱位' },
                    { value: '挫裂伤', label: '挫裂伤' },
                    { value: '挫伤', label: '挫伤' },
                    { value: '擦伤', label: '擦伤' },
                    { value: '颅脑损伤', label: '颅脑损伤' },
                    { value: '内脏损伤', label: '内脏损伤' },
                    { value: '烧烫伤', label: '烧烫伤' },
                    { value: '截肢', label: '截肢' },
                    { value: '死亡', label: '死亡' },
                    { value: '其他', label: '其他' },
                  ]}
                />
              </Col>
              <Col span={7}>
                <div className="field-label">伤情等级</div>
                <Select
                  disabled={D}
                  style={{ width: '100%' }}
                  placeholder="请选择"
                  value={injuryDesc.severity || undefined}
                  onChange={v => setID({ severity: v })}
                  options={[
                    { value: '轻微伤', label: '轻微伤' },
                    { value: '轻伤', label: '轻伤' },
                    { value: '重伤', label: '重伤' },
                    { value: '危重', label: '危重' },
                    { value: '死亡', label: '死亡' },
                  ]}
                />
              </Col>
              <Col span={24}>
                <div className="field-label">简要伤情说明</div>
                <Input.TextArea
                  disabled={D}
                  rows={2}
                  maxLength={300}
                  showCount
                  placeholder="简要描述受伤部位、损伤情况及初步诊断结论…"
                  value={injuryDesc.description}
                  onChange={e => setID({ description: e.target.value })}
                />
              </Col>
            </Row>
          </Card>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════
          骑手人伤（rider_injury）— 按雇主责任险/意外险给付型流程录入
          与三者责任险条款体系完全不同，独立处理
       ══════════════════════════════════════════════════════════════════ */}
      {false && isRiderInjuryTask && (() => {
        const D = !canEditSurveyForm;
        const f = (label: string, node: React.ReactNode, span = 8) => (
          <Col span={span}>
            <div style={{ marginBottom: 10 }}>
              <div className="field-label" style={{ marginBottom: 3 }}>{label}</div>
              {node}
            </div>
          </Col>
        );
        const ri = riderInjury;
        const setRi = (patch: Partial<RiderInjuryForm>) => {
          setRiderInjury((p) => {
            const next = { ...p, ...patch };
            setLossItems((prev) => mergeAutoLossItems(prev, recalcFromRiderInjury(next, riderMedicals)));
            return next;
          });
        };
        const setRiderMedicalsAndSync = (updater: (prev: RiderMedicalRecord[]) => RiderMedicalRecord[]) => {
          setRiderMedicals((prev) => {
            const next = updater(prev);
            setLossItems((curr) => mergeAutoLossItems(curr, recalcFromRiderInjury(riderInjury, next)));
            return next;
          });
        };

        // 工伤伤残等级（按《劳动能力鉴定 职工工伤与职业病致残程度》）
        const GONGSHANG_LEVELS = ['一级工伤','二级工伤','三级工伤','四级工伤','五级工伤','六级工伤','七级工伤','八级工伤','九级工伤','十级工伤'].map(v => ({ value: v, label: v }));
        // 人身损害伤残等级（按《人身保险伤残评定标准》JR/T 0083-2013）
        const YIWAI_LEVELS = ['一级伤残','二级伤残','三级伤残','四级伤残','五级伤残','六级伤残','七级伤残','八级伤残','九级伤残','十级伤残'].map(v => ({ value: v, label: v }));
        const disabilityOpts = ri.insurance_type === 'employer' ? GONGSHANG_LEVELS : ri.insurance_type === 'accident' ? YIWAI_LEVELS : [];

        const riderMedCols: any[] = [
          { title: '就诊类型', dataIndex: 'visit_type', width: 100, render: (_: any, r: RiderMedicalRecord) => <Select disabled={D} value={r.visit_type || undefined} style={{ width: '100%' }} options={[{value:'门诊',label:'门诊'},{value:'住院',label:'住院'},{value:'急诊',label:'急诊'}]} onChange={v => setRiderMedicalsAndSync(prev => prev.map(x => x.id===r.id?{...x,visit_type:v}:x))} /> },
          { title: '就诊医院', dataIndex: 'hospital', render: (_: any, r: RiderMedicalRecord) => <Input disabled={D} value={r.hospital} onChange={e => setRiderMedicalsAndSync(prev => prev.map(x => x.id===r.id?{...x,hospital:e.target.value}:x))} /> },
          { title: '就诊日期', dataIndex: 'visit_date', width: 120, render: (_: any, r: RiderMedicalRecord) => <Input disabled={D} value={r.visit_date} placeholder="YYYY-MM-DD" onChange={e => setRiderMedicalsAndSync(prev => prev.map(x => x.id===r.id?{...x,visit_date:e.target.value}:x))} /> },
          { title: '金额（元）', dataIndex: 'amount', width: 140, render: (_: any, r: RiderMedicalRecord) => <InputNumber disabled={D} min={0} precision={2} value={r.amount} style={{width:'100%'}} onChange={v => setRiderMedicalsAndSync(prev => prev.map(x => x.id===r.id?{...x,amount:v||0}:x))} /> },
          { title: '备注/票据说明', dataIndex: 'remark', render: (_: any, r: RiderMedicalRecord) => <Input disabled={D} value={r.remark} onChange={e => setRiderMedicalsAndSync(prev => prev.map(x => x.id===r.id?{...x,remark:e.target.value}:x))} /> },
          { title: '操作', width: 60, render: (_: any, r: RiderMedicalRecord) => !D && <Button type="link" danger size="small" onClick={() => setRiderMedicalsAndSync(prev => prev.filter(x => x.id!==r.id))}>删除</Button> },
        ];
        const medTotal = riderMedicals.reduce((s, r) => s + (r.amount || 0), 0);
        const lostWorkFee = (ri.lost_work_days||0) * (ri.daily_wage_standard||0);
        const nursingFee  = (ri.nursing_days||0)  * (ri.daily_nursing_fee||0);

        return (
          <>
            {/* 工资收入 */}
            <Card size="small" bordered style={{ marginBottom: 10 }}
              title={<Space><span style={{color:'#52c41a',fontWeight:600}}>工资收入</span></Space>}>
              <Row gutter={[12, 0]}>
                {f('月均工资（元）', <InputNumber disabled={D} min={0} precision={2} value={ri.monthly_wage} style={{width:'100%'}} onChange={v => setRi({monthly_wage:v||0})} />)}
                {f('工资发放形式', <Select disabled={D} value={ri.salary_form||undefined} style={{width:'100%'}} placeholder="请选择"
                  options={[{value:'银行转账',label:'银行转账'},{value:'现金',label:'现金'},{value:'微信',label:'微信'},{value:'支付宝',label:'支付宝'}]}
                  onChange={v => setRi({salary_form:v})} />)}
                {f('在职年限（月）', <InputNumber disabled={D} min={0} value={ri.work_years} style={{width:'100%'}} addonAfter="月" onChange={v => setRi({work_years:v||0})} />)}
                {f('工资证明材料', <Input disabled={D} value={ri.wage_proof_note} placeholder="如：提供近6个月银行流水、劳动合同" onChange={e => setRi({wage_proof_note:e.target.value})} />, 12)}
              </Row>
            </Card>

            {/* 医疗费明细 */}
            <Card size="small" bordered style={{ marginBottom: 10 }}
              title={<Space><span style={{color:'#1677ff',fontWeight:600}}>医疗费明细</span>
                <Tag color="blue">合计 ¥{medTotal.toFixed(2)}</Tag>
              </Space>}
              extra={!D && <Button size="small" onClick={() => setRiderMedicalsAndSync(prev => [...prev, {id:Date.now().toString(),visit_type:'',hospital:'',visit_date:'',amount:0,remark:''}])}>+ 新增记录</Button>}>
              <Table dataSource={riderMedicals} columns={riderMedCols} rowKey="id" pagination={false} size="small" scroll={{x:800}} />
            </Card>

            {/* 误工 / 护理期 */}
            <Card size="small" bordered style={{ marginBottom: 10 }}
              title={<Space><span style={{color:'#722ed1',fontWeight:600}}>误工 / 护理期</span></Space>}>
              <Row gutter={[12, 0]}>
                {f('误工天数', <InputNumber disabled={D} min={0} value={ri.lost_work_days} style={{width:'100%'}} addonAfter="天" onChange={v => setRi({lost_work_days:v||0})} />)}
                {f('日均误工费标准（元/天）', <InputNumber disabled={D} min={0} precision={2} value={ri.daily_wage_standard} style={{width:'100%'}} onChange={v => setRi({daily_wage_standard:v||0})} />)}
                {f('误工费合计（自动）', <div style={{padding:'4px 11px',background:'#f0f7ff',borderRadius:6,fontWeight:'bold',color:'#1677ff'}}>¥{lostWorkFee.toFixed(2)}</div>)}
                {f('护理天数', <InputNumber disabled={D} min={0} value={ri.nursing_days} style={{width:'100%'}} addonAfter="天" onChange={v => setRi({nursing_days:v||0})} />)}
                {f('日均护理费（元/天）', <InputNumber disabled={D} min={0} precision={2} value={ri.daily_nursing_fee} style={{width:'100%'}} onChange={v => setRi({daily_nursing_fee:v||0})} />)}
                {f('护理费合计（自动）', <div style={{padding:'4px 11px',background:'#f0f7ff',borderRadius:6,fontWeight:'bold',color:'#1677ff'}}>¥{nursingFee.toFixed(2)}</div>)}
                {f('护理需求等级', <Select disabled={D} value={ri.nursing_level||undefined} style={{width:'100%'}} placeholder="请选择"
                  options={[{value:'一级（完全护理）',label:'一级（完全护理）'},{value:'二级（大部分护理）',label:'二级（大部分护理）'},{value:'三级（部分护理）',label:'三级（部分护理）'},{value:'不需要',label:'不需要护理'}]}
                  onChange={v => setRi({nursing_level:v})} />, 12)}
              </Row>
            </Card>

            {/* 伤残鉴定 */}
            <Card size="small" bordered style={{ marginBottom: 4 }}
              title={<Space><span style={{color:'#eb2f96',fontWeight:600}}>伤残鉴定</span>
                {ri.insurance_type && <Tag color={ri.insurance_type==='employer'?'volcano':'geekblue'}>
                  {ri.insurance_type==='employer'?'适用工伤标准（GB/T 16180）':'适用人伤标准（JR/T 0083）'}
                </Tag>}
              </Space>}>
              {!ri.insurance_type
                ? <Alert type="warning" showIcon message="请先在顶部案件信息中选择承保险种，伤残鉴定标准将随险种联动" />
                : <Row gutter={[12, 0]}>
                  {f('伤残等级', <Select disabled={D} value={ri.disability_level||undefined} style={{width:'100%'}} placeholder="请选择伤残等级"
                    options={disabilityOpts} onChange={v => setRi({disability_level:v})} />)}
                  {f('鉴定机构', <Input disabled={D} value={ri.appraisal_org} placeholder="如：XX劳动能力鉴定委员会" onChange={e => setRi({appraisal_org:e.target.value})} />)}
                  {f('鉴定日期', <Input disabled={D} value={ri.appraisal_date} placeholder="YYYY-MM-DD" onChange={e => setRi({appraisal_date:e.target.value})} />)}
                  {f('鉴定报告编号', <Input disabled={D} value={ri.appraisal_no} onChange={e => setRi({appraisal_no:e.target.value})} />, 12)}
                </Row>
              }
            </Card>
          </>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════
          三者人伤（third_injury）— 按车险/侵权责任险人伤赔偿标准
          依据最高人民法院《人身损害赔偿司法解释》19项赔偿项目
       ══════════════════════════════════════════════════════════════════ */}
      {false && isThirdInjuryTask && (() => {
        const D = !canEditSurveyForm;
        const canAudit = canEdit && (role === 'INJURY_AUDITOR' || role === 'ADMIN');
        const claimedTotal = thirdInjuryItems.reduce((s, r) => s + (r.claimed_amount||0), 0);
        const auditedTotal = thirdInjuryItems.reduce((s, r) => s + (r.audited_amount||0), 0);
        const approvedCount = thirdInjuryItems.filter(r => r.approved).length;

        const updateItem = (id: string, patch: Partial<ThirdInjuryItem>) =>
          setThirdInjuryItems(prev => {
            const next = prev.map(x => x.id === id ? {...x,...patch} : x);
            setLossItems(curr => mergeAutoLossItems(curr, recalcFromThirdInjury(next)));
            return next;
          });

        const cols: any[] = [
          { title: '#', dataIndex: 'id', width: 40, render: (v: string) => <span style={{color:'#999'}}>{v}</span> },
          { title: '赔偿项目', dataIndex: 'item_name', width: 140, render: (v: string) => <span style={{fontWeight:600}}>{v}</span> },
          { title: '请求金额（元）', dataIndex: 'claimed_amount', width: 160,
            render: (_: any, r: ThirdInjuryItem) => <InputNumber disabled={D} min={0} precision={2} value={r.claimed_amount} style={{width:'100%'}} onChange={v => updateItem(r.id,{claimed_amount:v||0})} /> },
          { title: '计算依据', dataIndex: 'calc_basis',
            render: (_: any, r: ThirdInjuryItem) => <Input disabled={D} value={r.calc_basis} placeholder="如：住院7天×100元/天" onChange={e => updateItem(r.id,{calc_basis:e.target.value})} /> },
          { title: '核损金额（元）', dataIndex: 'audited_amount', width: 160,
            render: (_: any, r: ThirdInjuryItem) => <InputNumber disabled={!canAudit} min={0} precision={2} value={r.audited_amount} style={{width:'100%'}} onChange={v => updateItem(r.id,{audited_amount:v||0})} /> },
          { title: '核准', dataIndex: 'approved', width: 70,
            render: (_: any, r: ThirdInjuryItem) => <Switch disabled={!canAudit} checked={r.approved} size="small" checkedChildren="✓" unCheckedChildren="—" onChange={v => updateItem(r.id,{approved:v})} /> },
        ];

        return (
          <Card bordered={false} style={{ marginBottom: 16 }} title={
            <Space>
              <UserOutlined style={{ color: '#1677ff' }} />
              三者人伤赔偿项目录入
              <Tag color="blue">请求 ¥{claimedTotal.toFixed(2)}</Tag>
              {auditedTotal > 0 && <Tag color="purple">核损 ¥{auditedTotal.toFixed(2)}</Tag>}
              {approvedCount > 0 && <Tag color="green">已核准 {approvedCount}/19 项</Tag>}
              {activeTask && <Tag color="geekblue">{TASK_TYPE_LABEL[activeTask.task_type]}</Tag>}
            </Space>
          }>
            <Table
              dataSource={thirdInjuryItems}
              columns={cols}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 800 }}
              rowClassName={(r: ThirdInjuryItem) => r.approved ? '' : ''}
              summary={() => (
                <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 'bold' }}>
                  <Table.Summary.Cell index={0} colSpan={2}>合计</Table.Summary.Cell>
                  <Table.Summary.Cell index={2}><span style={{color:'#cf1322'}}>¥{claimedTotal.toFixed(2)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4}><span style={{color:'#722ed1'}}>¥{auditedTotal.toFixed(2)}</span></Table.Summary.Cell>
                  <Table.Summary.Cell index={5}><Tag color="green" style={{fontWeight:'normal'}}>{approvedCount}/19</Tag></Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        );
      })()}

      {/* ── 物损信息录入（仅物损任务显示，人伤任务不显示）── */}
      {/* ── 物损信息录入（仅物损任务显示，人伤任务不显示）── */}
      {isPropertyTask && (
        <Card bordered={false} style={{ marginBottom: 16 }}
          title={
            <Space>
              <CarOutlined style={{ color: '#722ed1' }} />
              物损信息录入
              <Tag color={canEditSurveyForm ? 'green' : 'default'}>{canEditSurveyForm ? '查勘员录入中' : '只读'}</Tag>
              {activeTask && <Tag color="purple">{TASK_TYPE_LABEL[activeTask.task_type]}</Tag>}
            </Space>
          }
        >
          <Card size="small" title="损失选择" style={{ marginBottom: 12 }} bordered>
            <Checkbox.Group
              options={PROPERTY_LOSS_OPTIONS}
              value={selectedPropertyLossTypes}
              onChange={(vals) => setSelectedPropertyLossTypes(vals as string[])}
            />
          </Card>

          {selectedPropertyLossTypes.includes('车辆维修费') && (
            <VehiclePartsCard
              caseId={caseData.id}
              taskId={activeTaskId}
              canEdit={canEditSurveyForm}
              onTotalChange={setRepairOrderMarketTotal}
            />
          )}

          {selectedPropertyLossTypes.includes('工时费') && (
            <LaborFeeCard
              canEdit={canEditSurveyForm}
              items={laborItems}
              onChange={setLaborItems}
            />
          )}

          {selectedPropertyLossTypes.some(t => ['拖车施救费', '随车随身物品损失', '其他财产损失'].includes(t)) && (
            <Card size="small" title="其他费用" style={{ marginBottom: 12 }} bordered>
              <Row gutter={16}>
                {selectedPropertyLossTypes.includes('拖车施救费') && (
                  <Col span={8}>
                    <div className="field-label">拖车施救费</div>
                    <InputNumber disabled={!canEditSurveyForm} min={0} precision={2}
                      value={propertyInfo.towing_fee}
                      onChange={v => updatePropertyInfo('towing_fee', v || 0)}
                      style={{ width: '100%' }} addonAfter="元" />
                  </Col>
                )}
                {selectedPropertyLossTypes.includes('随车随身物品损失') && (
                  <Col span={8}>
                    <div className="field-label">随车随身物品损失</div>
                    <InputNumber disabled={!canEditSurveyForm} min={0} precision={2}
                      value={propertyInfo.personal_items}
                      onChange={v => updatePropertyInfo('personal_items', v || 0)}
                      style={{ width: '100%' }} addonAfter="元" />
                  </Col>
                )}
                {selectedPropertyLossTypes.includes('其他财产损失') && (
                  <Col span={8}>
                    <div className="field-label">其他财产损失</div>
                    <InputNumber disabled={!canEditSurveyForm} min={0} precision={2}
                      value={propertyInfo.other_fee}
                      onChange={v => updatePropertyInfo('other_fee', v || 0)}
                      style={{ width: '100%' }} addonAfter="元" />
                  </Col>
                )}
              </Row>
              <div style={{ marginTop: 8, color: '#cf1322', fontWeight: 600 }}>
                合计 ¥ {((propertyInfo.towing_fee || 0) + (propertyInfo.personal_items || 0) + (propertyInfo.other_fee || 0)).toFixed(2)}
              </div>
            </Card>
          )}
        </Card>
      )}

      {/* ── 损失项核损清单（由上方信息自动带入，审核员在此审核每项）── */}
      {!isCustomerSplitPending && (
      <Card
        bordered={false}
        style={{ marginBottom: 16 }}
        title={
          <Space>
            <AuditOutlined style={{ color: '#722ed1' }} />
            核损理算清单
            <Tag color={lossItems.length > 0 ? 'purple' : 'default'}>
              {lossItems.length} 项 / 合计 ¥{lossItems.reduce((s, i) => s + (i.amount || 0), 0).toFixed(2)}
            </Tag>
          </Space>
        }
        extra={
          !isInjuryTask && canEditSurveyForm && (
            <Button size="small" onClick={() => setLossItems([...lossItems, { id: Date.now().toString(), category: '', amount: 0, remark: '手动添加', audited: false }])}>
              + 手动补充损失项
            </Button>
          )
        }
      >
        {!canEdit && (
          <Alert
            type="warning"
            showIcon
            message={caseData.has_litigation ? '案件诉讼挂起，编辑操作已冻结' : '调查阻塞中，编辑操作已冻结'}
            style={{ marginBottom: 12 }}
          />
        )}
        <Table
          dataSource={lossItems}
          columns={lossColumns}
          rowKey="id"
          pagination={false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={Math.max(1, lossColumns.length - 1)}>
                <Text strong>损失合计</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={Math.max(1, lossColumns.length - 1)} colSpan={1}>
                <Text strong style={{ color: '#cf1322', fontSize: 16 }}>
                  ¥ {totalAmount.toFixed(2)}
                </Text>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          )}
        />
      </Card>

      )}

      {!isCustomerSplitPending && (
      <Card bordered={false} style={{ marginBottom: 80 }} title="情况说明">
        {auditLog.length > 0 && (() => {
          const MAX_VISIBLE = 5;
          const visibleLog = timelineExpanded ? auditLog : auditLog.slice(0, MAX_VISIBLE);
          const hasMore = auditLog.length > MAX_VISIBLE;
          return (
            <>
              <Timeline
                style={{ marginBottom: hasMore ? 8 : 16 }}
                items={visibleLog.map((entry) => ({
                  color: entry.action.includes('退回') ? 'red' : entry.action.includes('通过') || entry.action.includes('结案') ? 'green' : 'blue',
                  children: (
                    <div>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {entry.time} · {entry.operator}{entry.node ? ` · ${entry.node}` : ''}
                      </div>
                      <div>{entry.action}{entry.remark ? `：${entry.remark}` : ''}</div>
                    </div>
                  ),
                }))}
              />
              {hasMore && (
                <Button
                  type="link"
                  size="small"
                  onClick={() => setTimelineExpanded(v => !v)}
                  style={{ padding: 0, marginBottom: 16 }}
                >
                  {timelineExpanded ? '收起' : `查看更多（共 ${auditLog.length} 条）`}
                </Button>
              )}
            </>
          );
        })()}
        <Input.TextArea
          rows={3}
          disabled={!canEditSurveyForm}
          value={caseComment}
          onChange={(e) => setCaseComment(e.target.value)}
          placeholder="请填写案件情况说明、定损依据补充、特别事项等"
        />
      </Card>
      )}

      {!isCustomerSplitPending && showPaymentInfoBlock && (
      <Card
        bordered={false}
        style={{ marginBottom: 16 }}
        title="支付信息"
        extra={canEditSurveyForm && <Button type="primary" onClick={addPaymentInfo}>新增支付信息</Button>}
      >
        <Table
          dataSource={paymentInfos}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无支付信息，请在提交定损前补充' }}
          columns={[
            {
              title: '录入姓名',
              dataIndex: 'payee_name',
              render: (value: string, record: PaymentInfoItem) => canEditSurveyForm ? (
                <Input value={value} placeholder="请输入录入姓名" onChange={(e) => updatePaymentInfo(record.id, 'payee_name', e.target.value)} />
              ) : (
                <span>{value || '—'}</span>
              ),
            },
            {
              title: '银行名称',
              dataIndex: 'bank_name',
              render: (value: string, record: PaymentInfoItem) => canEditSurveyForm ? (
                <Input value={value} placeholder="请输入银行名称" onChange={(e) => updatePaymentInfo(record.id, 'bank_name', e.target.value)} />
              ) : (
                <span>{value || '—'}</span>
              ),
            },
            {
              title: '银行账号',
              dataIndex: 'bank_account',
              render: (value: string, record: PaymentInfoItem) => canEditSurveyForm ? (
                <Input value={value} placeholder="请输入银行账号" onChange={(e) => updatePaymentInfo(record.id, 'bank_account', e.target.value)} />
              ) : (
                <span>{value || '—'}</span>
              ),
            },
            {
              title: '支付金额',
              dataIndex: 'payment_amount',
              width: 160,
              render: (value: number, record: PaymentInfoItem) => canEditSurveyForm ? (
                <InputNumber
                  min={0}
                  precision={2}
                  style={{ width: '100%' }}
                  value={value}
                  placeholder="请输入支付金额"
                  onChange={(nextValue) => updatePaymentInfo(record.id, 'payment_amount', nextValue || 0)}
                />
              ) : (
                <span>{value ? `¥${value.toFixed(2)}` : '—'}</span>
              ),
            },
            {
              title: '操作',
              width: 120,
              render: (_: any, record: PaymentInfoItem) => canEditSurveyForm ? (
                <Popconfirm title="确认删除该支付信息？" onConfirm={() => removePaymentInfo(record.id)}>
                  <Button type="link" danger>删除</Button>
                </Popconfirm>
              ) : null,
            },
          ]}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={3}>
                <Text strong>支付信息合计</Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3}>
                <Text strong style={{ color: '#cf1322' }}>
                  ¥ {paymentTotal.toFixed(2)}
                </Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} />
            </Table.Summary.Row>
          )}
        />
      </Card>
      )}

      {/* ── 底部操作栏 ── */}
      <div
        style={{
          position: 'fixed', bottom: 0, left: 226, right: 0, height: 64,
          background: '#fff', borderTop: '1px solid #e8e8e8',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 24px', zIndex: 99, boxShadow: '0 -2px 8px rgba(0,0,0,0.05)',
        }}
      >
        <Space size="large">
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => {
              const ref = caseData.case_no || id;
              const taskType = effectiveActiveTask?.task_type || '';
              // HashRouter 路由：完整 URL 形如 `${baseUrl}#/attachments/<ref>?taskType=<type>`
              const baseUrl = (import.meta as any).env?.BASE_URL || '/';
              const hash = `/attachments/${encodeURIComponent(ref || '')}?taskType=${encodeURIComponent(taskType)}`;
              const url = `${window.location.origin}${baseUrl.replace(/\/$/, '/')}#${hash}`;
              const opened = window.open(url, 'claim-attachments');
              if (!opened) {
                message.warning('浏览器拦截了单证管理窗口，请允许弹窗后重试。');
              }
            }}
          >
            上传附件
          </Button>
          <span>总核损：<Text strong style={{ color: '#cf1322', fontSize: 16 }}>¥ {totalAmount.toFixed(2)}</Text></span>
          {caseData.has_litigation && <Tag color="red" icon={<LockOutlined />}>诉讼挂起</Tag>}
          {caseData.investigation_blocking && <Tag color="volcano">调查阻塞</Tag>}
        </Space>

        <Space>
          {isCustomerSplitPending && (
            <Button type="primary" onClick={submitCustomerSplit}>
              提交分流
            </Button>
          )}

          {/* 保存草稿 */}
          {canEditItems && (
            <Button 
              icon={<SaveOutlined />} 
              onClick={() => {
                const payload = buildPersistedCase();
                api.saveClaim(caseData.id, payload)
                  .then(() => {
                    addLog(ROLE_DISPLAY[role] || role, '暂存草稿');
                    message.success('数据已保存');
                  })
                  .catch((err) => {
                    message.error(`保存失败：${err?.message || '请重试'}`);
                  });
              }}
            >
              保存数据
            </Button>
          )}

          {/* ── ADMIN 操作按钮 ── */}
          {role === 'ADMIN' && !caseData.has_litigation && !caseData.investigation_blocking && (
            <>
              {/* 复勘 / 调查 */}
              <Button icon={<CameraOutlined />} onClick={() => setReInspModal(true)}>发起复勘</Button>
              <Button icon={<SearchOutlined />} onClick={() => setInvestigateModal(true)}>发起调查</Button>

              {/* 立案审核通过 */}
              {(currentTaskStatus === 'SUBMITTED_REG') && (
                <>
                  <Popconfirm title="确认退回立案？" onConfirm={() => rejectStatus('PENDING')}>
                    <Button danger>退回修改</Button>
                  </Popconfirm>
                  <Button type="primary" onClick={() => advanceStatus('REG_APPROVED', '通过立案审核')}>
                    通过立案审核
                  </Button>
                </>
              )}

              {/* 提交协议审核 / 协议审核通过 */}
              {currentTaskStatus === 'REG_APPROVED' && (
                <Button type="primary" onClick={() => showCenteredConfirm('确认提交协议上报？', () => advanceStatus('SUBMITTED_AGREEMENT', '提交协议上报'))}>
                  提交协议上报
                </Button>
              )}
              {currentTaskStatus === 'SUBMITTED_AGREEMENT' && (
                <>
                  <Popconfirm title="确认退回协议修改？" onConfirm={() => rejectStatus('REG_APPROVED')}>
                    <Button danger>退回修改</Button>
                  </Popconfirm>
                  <Button type="primary" onClick={() => advanceStatus('AGREEMENT_APPROVED', '通过协议审核')}>
                    通过协议审核
                  </Button>
                </>
              )}

              {/* 定损审核 */}
              {currentTaskStatus === 'SUBMITTED_SURVEY' && (
                <>
                  <Tooltip title={!lossItems.every(l => l.audited) ? '须当前任务损失项全部完成审核后方可通过定损审核' : ''}>
                    <Button
                      type="primary"
                      disabled={!lossItems.every(l => l.audited)}
                      icon={<AuditOutlined />}
                      onClick={() => advanceStatus('SURVEY_APPROVED', '通过定损审核')}
                    >
                      通过定损审核
                    </Button>
                  </Tooltip>
                  <Popconfirm title="退回重新理算？" onConfirm={() => rejectStatus('AGREEMENT_APPROVED')}>
                    <Button danger>退回重理算</Button>
                  </Popconfirm>
                </>
              )}

              {/* 发起财务结案 */}
              {currentTaskStatus === 'SURVEY_APPROVED' && (
                <Button type="primary" onClick={() => advanceStatus('DONE', '结案')}>
                  确认结案
                </Button>
              )}

              {/* 诉讼挂起登记（任意非结案状态） */}
              {caseData.status !== 'DONE' && (
                <Button danger icon={<WarningOutlined />} onClick={() => setLitigationModal(true)}>
                  登记诉讼
                </Button>
              )}
            </>
          )}

          {/* ADMIN 诉讼挂起中只显示录入判决 */}
          {role === 'ADMIN' && caseData.has_litigation && (
            <Button danger onClick={() => setJudgmentModal(true)}>录入判决</Button>
          )}

          {/* ── INJURY_AUDITOR 操作按钮 ── */}
          {role === 'INJURY_AUDITOR' && !caseData.has_litigation && isInjuryTask && currentTaskStatus === 'SUBMITTED_REG' && (
            <>
              <Popconfirm title="确认退回立案申请？" onConfirm={() => rejectStatus('PENDING')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => advanceStatus('REG_APPROVED', '人伤立案审核通过')}>
                通过
              </Button>
            </>
          )}
          {role === 'INJURY_AUDITOR' && !caseData.has_litigation && isInjuryTask && currentTaskStatus === 'SUBMITTED_AGREEMENT' && (
            <>
              <Popconfirm title="确认退回协议上报？" onConfirm={() => rejectStatus('REG_APPROVED')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => advanceStatus('AGREEMENT_APPROVED', '人伤协议审核通过')}>
                通过
              </Button>
            </>
          )}
          {role === 'INJURY_AUDITOR' && !caseData.has_litigation && isInjuryTask && currentTaskStatus === 'SUBMITTED_SURVEY' && (
            <>
              <Popconfirm title="确认退回定损上报？" onConfirm={() => rejectStatus('AGREEMENT_APPROVED')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Tooltip title={!lossItems.every(l => l.audited) ? '请先完成当前任务损失项审核' : ''}>
                <Button
                  type="primary"
                  disabled={!lossItems.every(l => l.audited)}
                  onClick={() => advanceStatus('SURVEY_APPROVED', '人伤定损审核通过')}
                >
                  通过
                </Button>
              </Tooltip>
            </>
          )}

          {/* ── PROPERTY_AUDITOR 操作按钮 ── */}
          {role === 'PROPERTY_AUDITOR' && !caseData.has_litigation && isPropertyTask && currentTaskStatus === 'SUBMITTED_REG' && (
            <>
              <Popconfirm title="确认退回立案申请？" onConfirm={() => rejectStatus('PENDING')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => advanceStatus('REG_APPROVED', '物损立案审核通过')}>
                通过
              </Button>
            </>
          )}
          {role === 'PROPERTY_AUDITOR' && !caseData.has_litigation && isPropertyTask && currentTaskStatus === 'SUBMITTED_AGREEMENT' && (
            <>
              <Popconfirm title="确认退回协议上报？" onConfirm={() => rejectStatus('REG_APPROVED')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Button type="primary" onClick={() => advanceStatus('AGREEMENT_APPROVED', '物损协议审核通过')}>
                通过
              </Button>
            </>
          )}
          {role === 'PROPERTY_AUDITOR' && !caseData.has_litigation && isPropertyTask && currentTaskStatus === 'SUBMITTED_SURVEY' && (
            <>
              <Popconfirm title="确认退回定损上报？" onConfirm={() => rejectStatus('AGREEMENT_APPROVED')}>
                <Button danger>退回</Button>
              </Popconfirm>
              <Tooltip title={!lossItems.every(l => l.audited) ? '请先完成当前任务损失项审核' : ''}>
                <Button
                  type="primary"
                  disabled={!lossItems.every(l => l.audited)}
                  onClick={() => advanceStatus('SURVEY_APPROVED', '物损定损审核通过')}
                >
                  通过
                </Button>
              </Tooltip>
            </>
          )}

          {/* ── INJURY_SURVEYOR 操作按钮 ── */}
          {role === 'INJURY_SURVEYOR' && !caseData.has_litigation && !caseData.investigation_blocking && (
            <>
              {currentTaskStatus === 'PENDING' && (
                <Button type="primary" onClick={() => showCenteredConfirm('确认提交立案申请？', () => advanceStatus('SUBMITTED_REG', '人伤查勘员提交立案申请', true))}>提交立案</Button>
              )}
              {currentTaskStatus === 'REG_APPROVED' && (
                <Button type="primary" onClick={() => showCenteredConfirm('确认提交协议上报？', () => advanceStatus('SUBMITTED_AGREEMENT', '人伤查勘员提交协议上报', true))}>提交协议上报</Button>
              )}
              {currentTaskStatus === 'AGREEMENT_APPROVED' && (
                <Tooltip title={!canSubmitSurveyReport ? getSubmitSurveyBlockReason() : ''}>
                  <Button
                    type="primary"
                    disabled={!canSubmitSurveyReport}
                    onClick={() => {
                      if (!ensureCanSubmitSurveyReport()) return;
                      showCenteredConfirm('确认提交定损上报？', () => advanceStatus('SUBMITTED_SURVEY', '人伤查勘员提交定损上报', true));
                    }}
                  >
                    提交定损上报
                  </Button>
                </Tooltip>
              )}
            </>
          )}

          {/* ── PROPERTY_SURVEYOR 操作按钮 ── */}
          {role === 'PROPERTY_SURVEYOR' && !caseData.has_litigation && !caseData.investigation_blocking && (
            <>
              {currentTaskStatus === 'PENDING' && (
                <Button type="primary" onClick={() => showCenteredConfirm('确认提交立案申请？', () => advanceStatus('SUBMITTED_REG', '物损查勘员提交立案申请', true))}>提交立案</Button>
              )}
              {currentTaskStatus === 'REG_APPROVED' && (
                <Button type="primary" onClick={() => showCenteredConfirm('确认提交协议上报？', () => advanceStatus('SUBMITTED_AGREEMENT', '物损查勘员提交协议上报', true))}>提交协议上报</Button>
              )}
              {currentTaskStatus === 'AGREEMENT_APPROVED' && (
                <Tooltip title={!canSubmitSurveyReport ? getSubmitSurveyBlockReason() : ''}>
                  <Button
                    type="primary"
                    disabled={!canSubmitSurveyReport}
                    onClick={() => {
                      if (!ensureCanSubmitSurveyReport()) return;
                      showCenteredConfirm('确认提交定损上报？', () => advanceStatus('SUBMITTED_SURVEY', '物损查勘员提交定损上报', true));
                    }}
                  >
                    提交定损上报
                  </Button>
                </Tooltip>
              )}
            </>
          )}
        </Space>
      </div>

      {/* ── 发起复勘 Modal ── */}
      <Modal
        title="发起复勘"
        open={reInspModal}
        onCancel={() => setReInspModal(false)}
        onOk={() => reInspForm.submit()}
        okText="发起复勘"
      >
        <Form form={reInspForm} layout="vertical" onFinish={handleReInspection}>
          <Form.Item label="复勘原因" name="reason" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请说明需要复勘的原因" />
          </Form.Item>
          <Form.Item label="要求完成时间" name="deadline" rules={[{ required: true }]}>
            <Input placeholder="例：2026-04-10 17:00" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 发起调查 Modal ── */}
      <Modal
        title="发起调查任务"
        open={investigateModal}
        onCancel={() => setInvestigateModal(false)}
        onOk={() => investigateForm.submit()}
        okText="发起调查"
      >
        <Form form={investigateForm} layout="vertical" onFinish={handleInvestigation} initialValues={{ blocking: true }}>
          <Form.Item label="委托调查机构" name="agency" rules={[{ required: true }]}>
            <Input placeholder="请输入调查公司/机构名称" />
          </Form.Item>
          <Form.Item label="调查事项" name="matter" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="是否阻塞案件推进" name="blocking" valuePropName="checked">
            <input type="checkbox" defaultChecked style={{ marginRight: 8 }} />
            调查完결前阻塞案件推进操作
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 登记诉讼 Modal ── */}
      <Modal
        title={<><WarningOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />登记诉讼（将挂起案件）</>}
        open={litigationModal}
        onCancel={() => setLitigationModal(false)}
        onOk={() => litigationForm.submit()}
        okText="确认登记诉讼"
        okButtonProps={{ danger: true }}
      >
        <Alert
          type="error"
          message="登记诉讼后，案件进入挂起状态，所有推进操作将被冻结，直至录入判决结果"
          style={{ marginBottom: 16 }}
          showIcon
        />
        <Form form={litigationForm} layout="vertical" onFinish={handleRegisterLitigation}>
          <Form.Item label="诉讼案由" name="case_reason" rules={[{ required: true }]}>
            <Input placeholder="请简述诉讼原因" />
          </Form.Item>
          <Form.Item label="原告方" name="plaintiff" rules={[{ required: true }]}>
            <Input placeholder="原告姓名/机构" />
          </Form.Item>
          <Form.Item label="受理法院" name="court">
            <Input placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 编辑案件主信息 Modal ── */}
      <Modal
        title={<><EditOutlined style={{ color: '#1677ff', marginRight: 8 }} />编辑案件主信息</>}
        open={caseEditOpen}
        onCancel={() => setCaseEditOpen(false)}
        onOk={submitCaseEdit}
        okText="保存"
        confirmLoading={caseEditSaving}
        width={760}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="仅修改案件主信息（骑手、车辆、出险、责任等）。任务数据由对应角色在各自任务池中处理。"
          style={{ marginBottom: 16 }}
        />
        <Form form={caseEditForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="报案人姓名" name="reporter_name">
                <Input placeholder="请输入" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="报案人电话" name="reporter_phone">
                <Input placeholder="请输入" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="出险时间" name="accident_time">
                <Input placeholder="YYYY-MM-DD HH:mm:ss" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="出险地点" name="accident_location">
                <Input placeholder="省/市/区 + 详细地址" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="事故简述" name="accident_desc">
            <Input.TextArea rows={2} placeholder="请简述事故经过" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="骑手姓名" name="rider_name">
                <Input placeholder="被保险人/骑手姓名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="骑手工号 / 平台 ID" name="rider_id">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="出险运单号" name="order_id">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="标的车类型" name="vehicle_type">
                <Select
                  placeholder="请选择"
                  options={[
                    { value: 'E_BIKE', label: '电动自行车（非机动车）' },
                    { value: 'E_MOTOR', label: '电动摩托车（机动车）' },
                    { value: 'FUEL_MOTOR', label: '燃油摩托车（机动车）' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="车牌 / 车架号" name="vehicle_plate">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="险种" name="product">
                <Select
                  placeholder="请选择"
                  options={[
                    { value: 'EMPLOYER', label: '雇主责任险（针对被雇骑手）' },
                    { value: 'GROUP_ACCIDENT', label: '团体意外险（含附加三者）' },
                    { value: 'MOTOR_COMP', label: '摩托车综合险' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="我方责任比例 (%)" name="liability_ratio">
            <Input type="number" min={0} max={100} suffix="%" />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── 追加任务 Modal ── */}
      <Modal
        title={<><PlusOutlined style={{ color: '#52c41a', marginRight: 8 }} />新增任务（追加条线）</>}
        open={appendTaskOpen}
        onCancel={() => setAppendTaskOpen(false)}
        onOk={submitAppendTask}
        okText="确认新增"
        confirmLoading={appendTaskSaving}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="为当前案件追加尚未创建的任务条线。已存在的条线会被自动过滤。"
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 8 }}>当前案件已存在的条线：</div>
        <Space wrap style={{ marginBottom: 16 }}>
          {(caseData.tasks || []).map((t) => (
            <Tag key={t.id} color="default">{TASK_TYPE_LABEL[t.task_type] || t.task_type}</Tag>
          ))}
          {(caseData.tasks || []).length === 0 && <Text type="secondary">无（将一次性创建所选条线）</Text>}
        </Space>
        <div style={{ marginBottom: 8 }}>请勾选要追加的条线：</div>
        <Checkbox.Group
          value={appendTaskTypes}
          onChange={(vals) => setAppendTaskTypes(vals as string[])}
          style={{ width: '100%' }}
        >
          <Space direction="vertical">
            {[
              { value: 'rider_injury', label: '本车骑手人伤' },
              { value: 'third_injury', label: '三者人伤' },
              { value: 'third_vehicle', label: '三者车损' },
              { value: 'third_property', label: '三者物损' },
            ].map((opt) => {
              const exists = (caseData.tasks || []).some((t) => t.task_type === opt.value);
              return (
                <Checkbox key={opt.value} value={opt.value} disabled={exists}>
                  {opt.label} {exists && <Tag color="default" style={{ marginLeft: 4 }}>已存在</Tag>}
                </Checkbox>
              );
            })}
          </Space>
        </Checkbox.Group>
      </Modal>

      {/* ── 录入判决 Modal ── */}
      <Modal
        title="录入判决结果"
        open={judgmentModal}
        onCancel={() => setJudgmentModal(false)}
        onOk={() => judgmentForm.submit()}
        okText="确认录入，恢复理赔"
      >
        <Form form={judgmentForm} layout="vertical" onFinish={handleInputJudgment}>
          <Form.Item label="判决结果摘要" name="judgment" rules={[{ required: true }]}>
            <Input.TextArea rows={4} placeholder="请输入法院判决书摘要" />
          </Form.Item>
          <Form.Item label="判决赔付金额（元）" name="judgment_amount">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

