
// ─── 角色 ───────────────────────────────────────────────
export const ROLES: Record<string, { label: string; color: string; line?: string }> = {
  CUSTOMER_SERVICE:     { label: '客服专员',     color: 'gold'                        },  // 接件 & 分流
  ADMIN:                { label: '管理人',       color: 'volcano'                     },  // 主流程推进 & 审批
  INJURY_SURVEYOR:      { label: '人伤查勘员',   color: 'cyan',      line: 'injury'   },
  INJURY_AUDITOR:       { label: '人伤审核员',   color: 'geekblue',  line: 'injury'   },
  PROPERTY_SURVEYOR:    { label: '物损查勘员',   color: 'green',     line: 'property' },
  PROPERTY_AUDITOR:     { label: '物损审核员',   color: 'purple',    line: 'property' },
  LITIGATION_OPERATOR:  { label: '诉讼作业岗',   color: 'magenta'                     },  // 诉讼录入/推进
  LITIGATION_AUDITOR:   { label: '诉讼审核岗',   color: 'red'                         },  // 诉讼审核
};

/** 属于查勘员条线的角色 */
export const SURVEYOR_ROLES = ['INJURY_SURVEYOR', 'PROPERTY_SURVEYOR'];
/** 属于审核员条线的角色 */
export const AUDITOR_ROLES  = ['INJURY_AUDITOR',  'PROPERTY_AUDITOR', 'LITIGATION_AUDITOR'];
/** 人伤条线角色 */
export const INJURY_ROLES   = ['INJURY_SURVEYOR', 'INJURY_AUDITOR'];
/** 物损条线角色 */
export const PROPERTY_ROLES = ['PROPERTY_SURVEYOR', 'PROPERTY_AUDITOR'];
/** 诉讼条线角色 */
export const LITIGATION_ROLES = ['LITIGATION_OPERATOR', 'LITIGATION_AUDITOR'];

// ─── 5 个工作台定义 ──────────────────────────────────────
export type WorkbenchKey = 'claim' | 'audit' | 'litigation' | 'auxiliary' | 'settings';

export interface WorkbenchDef {
  key: WorkbenchKey;
  label: string;
  path: string;          // 默认进入路径
  iconKey: 'claim' | 'audit' | 'litigation' | 'auxiliary' | 'settings';
}

export const WORKBENCHES: WorkbenchDef[] = [
  { key: 'claim',      label: '理赔工作台',   path: '/dashboard/claim',      iconKey: 'claim' },
  { key: 'audit',      label: '审核工作台',   path: '/dashboard/audit',      iconKey: 'audit' },
  { key: 'litigation', label: '诉讼工作台',   path: '/dashboard/litigation', iconKey: 'litigation' },
  { key: 'auxiliary',  label: '辅助任务工作台', path: '/dashboard/auxiliary', iconKey: 'auxiliary' },
  { key: 'settings',   label: '系统设置',     path: '/settings',             iconKey: 'settings' },
];

/** 角色 → 工作台可见性映射（按 `key` 过滤 WORKBENCHES） */
export const ROLE_WORKBENCHES: Record<string, WorkbenchKey[]> = {
  CUSTOMER_SERVICE:    ['claim'],
  INJURY_SURVEYOR:     ['claim'],
  INJURY_AUDITOR:      ['audit', 'auxiliary'],
  PROPERTY_SURVEYOR:   ['claim'],
  PROPERTY_AUDITOR:    ['audit', 'auxiliary'],
  LITIGATION_OPERATOR: ['litigation'],
  LITIGATION_AUDITOR:  ['litigation', 'auxiliary'],
  ADMIN:               ['claim', 'audit', 'litigation', 'auxiliary', 'settings'],
};

// ─── 车辆类型 ────────────────────────────────────────────
export const VEHICLE_TYPE_OPTIONS = [
  { value: 'E_BIKE', label: '电动自行车（非机动车）' },
  { value: 'E_MOTOR', label: '电动摩托车（机动车）' },
  { value: 'FUEL_MOTOR', label: '燃油摩托车（机动车）' },
];

export const IS_MOTOR_VEHICLE: Record<string, boolean> = {
  E_BIKE: false,
  E_MOTOR: true,
  FUEL_MOTOR: true,
};

// ─── 任务类型 ────────────────────────────────────────────
export const TASK_TYPE_LABEL: Record<string, string> = {
  rider_injury: '本车骑手人伤',
  third_injury: '三者人伤',
  third_vehicle: '三者车损',
  third_property: '三者物损',
};

// ─── 任务状态机 ──────────────────────────────────────────
export const TASK_STATUS_LABEL: Record<string, string> = {
  PENDING_SPLIT: '待分流',
  PENDING: '待查勘录入',
  SUBMITTED_REG: '待立案审核',
  REG_APPROVED: '立案通过',
  SUBMITTED_AGREEMENT: '待协议审核',
  AGREEMENT_APPROVED: '协议通过',
  SUBMITTED_SURVEY: '待定损审核',
  SURVEY_APPROVED: '定损通过',
  DONE: '已结案',
};

export const TASK_STATUS_COLOR: Record<string, string> = {
  PENDING_SPLIT: 'warning',
  PENDING: 'default',
  SUBMITTED_REG: 'processing',
  REG_APPROVED: 'blue',
  SUBMITTED_AGREEMENT: 'processing',
  AGREEMENT_APPROVED: 'cyan',
  SUBMITTED_SURVEY: 'processing',
  SURVEY_APPROVED: 'geekblue',
  DONE: 'success',
};

export const TASK_STATUS_STEPS = [
  'PENDING',
  'SUBMITTED_REG',
  'REG_APPROVED',
  'SUBMITTED_AGREEMENT',
  'AGREEMENT_APPROVED',
  'SUBMITTED_SURVEY',
  'SURVEY_APPROVED',
  'DONE',
];

export type TaskFlowStatus =
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'RETURNED'
  | 'ASSESSED'
  | 'FINISHED';

export const TASK_FLOW_STATUS_LABEL: Record<TaskFlowStatus, string> = {
  PROCESSING: '处理中',
  SUBMITTED: '已提交',
  UNDER_REVIEW: '审核中',
  RETURNED: '已退回',
  ASSESSED: '已定损',
  FINISHED: '已结束',
};

export const TASK_FLOW_STATUS_COLOR: Record<TaskFlowStatus, string> = {
  PROCESSING: 'default',
  SUBMITTED: 'processing',
  UNDER_REVIEW: 'blue',
  RETURNED: 'warning',
  ASSESSED: 'geekblue',
  FINISHED: 'success',
};

export const TASK_STATUS_ORDER: Record<string, number> = {
  PENDING_SPLIT: 0,
  PENDING: 1,
  SUBMITTED_REG: 2,
  REG_APPROVED: 3,
  SUBMITTED_AGREEMENT: 4,
  AGREEMENT_APPROVED: 5,
  SUBMITTED_SURVEY: 6,
  SURVEY_APPROVED: 7,
  DONE: 8,
};

export function deriveCaseStatusFromTasks<T extends string>(
  tasks: Array<{ status?: T }> = [],
  fallback: T
): T {
  if (!tasks.length) return fallback;
  return tasks.reduce((current, task) => {
    const taskStatus = task.status || fallback;
    return (TASK_STATUS_ORDER[taskStatus] ?? Number.MAX_SAFE_INTEGER) < (TASK_STATUS_ORDER[current] ?? Number.MAX_SAFE_INTEGER)
      ? taskStatus
      : current;
  }, tasks[0]?.status || fallback);
}

export function deriveTaskFlowStatus(task: { status?: string; flow_status?: TaskFlowStatus }): TaskFlowStatus {
  if (task.flow_status === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (task.flow_status === 'RETURNED') return 'RETURNED';
  if (task.flow_status === 'FINISHED') return 'FINISHED';

  if (task.status === 'DONE') return 'FINISHED';
  if (task.status === 'SURVEY_APPROVED') return 'ASSESSED';
  if (task.status === 'SUBMITTED_REG' || task.status === 'SUBMITTED_AGREEMENT' || task.status === 'SUBMITTED_SURVEY') {
    return 'SUBMITTED';
  }
  return 'PROCESSING';
}

// ─── 人伤损失项分类 ───────────────────────────────────────
export const INJURY_DETAIL_TYPES = [
  { value: 'MEDICAL_FEE', label: '医疗费', businessLine: 'injury' },
  { value: 'LOST_INCOME', label: '误工费', businessLine: 'injury' },
  { value: 'NURSING_FEE', label: '护理费', businessLine: 'injury' },
  { value: 'NUTRITION_FEE', label: '营养费', businessLine: 'injury' },
  { value: 'TRANSPORTATION_FEE', label: '交通费', businessLine: 'injury' },
  { value: 'DISABILITY_COMP', label: '伤残赔偿金', businessLine: 'injury' },
  { value: 'DEATH_COMP', label: '死亡赔偿金', businessLine: 'injury' },
  { value: 'FUNERAL_FEE', label: '丧葬费', businessLine: 'injury' },
  { value: 'MENTAL_COMP', label: '精神损害抚慰金', businessLine: 'injury' },
];

// ─── 物损损失项分类 ───────────────────────────────────────
export const PROPERTY_DETAIL_TYPES = [
  { value: 'VEHICLE_REPAIR', label: '车辆维修费', businessLine: 'property' },
  { value: 'LABOR_FEE', label: '工时费', businessLine: 'property' },
  { value: 'VEHICLE_DEPRECIATION', label: '车辆贬值损失', businessLine: 'property' },
  { value: 'PERSONAL_ITEMS', label: '随车/随身物品损失', businessLine: 'property' },
  { value: 'TOWING_FEE', label: '施救拖车费', businessLine: 'property' },
  { value: 'OTHER_PROPERTY', label: '其他财产损失', businessLine: 'property' },
];

// ─── 伤残等级 ─────────────────────────────────────────────
// 系数：1 级 = 100%，2 级 = 90%，依此类推，10 级 = 10%（每级递减 10%）。
// 公式：伤残赔偿金 = 保单伤残保额 × 等级系数 × 赔偿年限
// 如需调成 5% 步长或不同标准，修改下面的 ratio 即可。
export const DISABILITY_LEVEL: Record<number, { label: string; ratio: number }> = {
  1:  { label: '一级（100%）', ratio: 1.0  },
  2:  { label: '二级（90%）',  ratio: 0.9  },
  3:  { label: '三级（80%）',  ratio: 0.8  },
  4:  { label: '四级（70%）',  ratio: 0.7  },
  5:  { label: '五级（60%）',  ratio: 0.6  },
  6:  { label: '六级（50%）',  ratio: 0.5  },
  7:  { label: '七级（40%）',  ratio: 0.4  },
  8:  { label: '八级（30%）',  ratio: 0.3  },
  9:  { label: '九级（20%）',  ratio: 0.2  },
  10: { label: '十级（10%）',  ratio: 0.1  },
};

// ─── 工时项目库（前端内嵌种子数据）────────────────────────────────────
export interface LaborCatalogItem {
  id: string;
  category: string;          // 工时大类
  name: string;              // 工时项目
  reference_price: number;   // 工时参考价（元）
}

export const LABOR_CATALOG: LaborCatalogItem[] = [
  // 喷漆
  { id: 'lp-01', category: '喷漆', name: '前保险杠喷漆', reference_price: 400 },
  { id: 'lp-02', category: '喷漆', name: '后保险杠喷漆', reference_price: 400 },
  { id: 'lp-03', category: '喷漆', name: '前叶子板(左)喷漆', reference_price: 350 },
  { id: 'lp-04', category: '喷漆', name: '前叶子板(右)喷漆', reference_price: 350 },
  { id: 'lp-05', category: '喷漆', name: '后叶子板(左)喷漆', reference_price: 350 },
  { id: 'lp-06', category: '喷漆', name: '后叶子板(右)喷漆', reference_price: 350 },
  { id: 'lp-07', category: '喷漆', name: '引擎盖喷漆', reference_price: 500 },
  { id: 'lp-08', category: '喷漆', name: '后备箱盖喷漆', reference_price: 500 },
  { id: 'lp-09', category: '喷漆', name: '车顶喷漆', reference_price: 600 },
  { id: 'lp-10', category: '喷漆', name: '车门(左前)喷漆', reference_price: 400 },
  { id: 'lp-11', category: '喷漆', name: '车门(右前)喷漆', reference_price: 400 },
  { id: 'lp-12', category: '喷漆', name: '车门(左后)喷漆', reference_price: 400 },
  { id: 'lp-13', category: '喷漆', name: '车门(右后)喷漆', reference_price: 400 },
  { id: 'lp-14', category: '喷漆', name: 'A柱喷漆', reference_price: 200 },
  { id: 'lp-15', category: '喷漆', name: 'B柱喷漆', reference_price: 200 },
  { id: 'lp-16', category: '喷漆', name: 'C柱喷漆', reference_price: 200 },
  // 钣金
  { id: 'lb-01', category: '钣金', name: '前保险杠钣金', reference_price: 300 },
  { id: 'lb-02', category: '钣金', name: '后保险杠钣金', reference_price: 300 },
  { id: 'lb-03', category: '钣金', name: '前叶子板(左)钣金', reference_price: 350 },
  { id: 'lb-04', category: '钣金', name: '前叶子板(右)钣金', reference_price: 350 },
  { id: 'lb-05', category: '钣金', name: '后叶子板(左)钣金', reference_price: 350 },
  { id: 'lb-06', category: '钣金', name: '后叶子板(右)钣金', reference_price: 350 },
  { id: 'lb-07', category: '钣金', name: '引擎盖钣金', reference_price: 500 },
  { id: 'lb-08', category: '钣金', name: '后备箱盖钣金', reference_price: 500 },
  { id: 'lb-09', category: '钣金', name: '车门(左前)钣金', reference_price: 400 },
  { id: 'lb-10', category: '钣金', name: '车门(右前)钣金', reference_price: 400 },
  { id: 'lb-11', category: '钣金', name: '车门(左后)钣金', reference_price: 400 },
  { id: 'lb-12', category: '钣金', name: '车门(右后)钣金', reference_price: 400 },
  { id: 'lb-13', category: '钣金', name: '车顶钣金', reference_price: 600 },
  // 拆装
  { id: 'lc-01', category: '拆装', name: '前保险杠拆装', reference_price: 200 },
  { id: 'lc-02', category: '拆装', name: '后保险杠拆装', reference_price: 200 },
  { id: 'lc-03', category: '拆装', name: '前大灯(左)拆装', reference_price: 150 },
  { id: 'lc-04', category: '拆装', name: '前大灯(右)拆装', reference_price: 150 },
  { id: 'lc-05', category: '拆装', name: '尾灯(左)拆装', reference_price: 150 },
  { id: 'lc-06', category: '拆装', name: '尾灯(右)拆装', reference_price: 150 },
  { id: 'lc-07', category: '拆装', name: '车门(左前)拆装', reference_price: 250 },
  { id: 'lc-08', category: '拆装', name: '车门(右前)拆装', reference_price: 250 },
  { id: 'lc-09', category: '拆装', name: '车门(左后)拆装', reference_price: 250 },
  { id: 'lc-10', category: '拆装', name: '车门(右后)拆装', reference_price: 250 },
  { id: 'lc-11', category: '拆装', name: '引擎盖拆装', reference_price: 200 },
  { id: 'lc-12', category: '拆装', name: '后备箱盖拆装', reference_price: 200 },
  { id: 'lc-13', category: '拆装', name: '前挡风玻璃拆装', reference_price: 400 },
  { id: 'lc-14', category: '拆装', name: '后挡风玻璃拆装', reference_price: 350 },
  // 机修
  { id: 'lm-01', category: '机修', name: '水箱拆装', reference_price: 300 },
  { id: 'lm-02', category: '机修', name: '冷凝器拆装', reference_price: 300 },
  { id: 'lm-03', category: '机修', name: '发动机吊装', reference_price: 1500 },
  { id: 'lm-04', category: '机修', name: '变速箱吊装', reference_price: 1200 },
  { id: 'lm-05', category: '机修', name: '副车架拆装', reference_price: 600 },
  { id: 'lm-06', category: '机修', name: '悬挂系统调试', reference_price: 400 },
  { id: 'lm-07', category: '机修', name: '四轮定位', reference_price: 300 },
  { id: 'lm-08', category: '机修', name: '空调系统检测', reference_price: 200 },
];

/** 工时项目大类列表（从种子数据自动提取） */
export const LABOR_CATEGORIES = Array.from(new Set(LABOR_CATALOG.map((i) => i.category)));
