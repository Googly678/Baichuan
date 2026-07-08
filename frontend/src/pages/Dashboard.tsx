import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Space, Button, Badge, Row, Col, Statistic, Tabs, Typography, Tooltip, message,
} from 'antd';
import {
  ArrowRightOutlined, PlusOutlined, ClockCircleOutlined,
  CheckCircleOutlined, SyncOutlined, MedicineBoxOutlined, CarOutlined,
  FileSearchOutlined, AuditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { RoleContext } from '../App';
import type { ClaimCase } from '../types/claim';
import { api } from '../utils/api';
import { deriveCaseStatusFromTasks, deriveTaskFlowStatus, TASK_FLOW_STATUS_COLOR, TASK_FLOW_STATUS_LABEL } from '../utils/constants';

const { Text } = Typography;

// ─── 状态与颜色 ─────────────────────────────────────────────────────────────
const STATUS_TAG: Record<string, React.ReactNode> = {
  PENDING_SPLIT:       <Tag color="warning">待分流</Tag>,
  PENDING:             <Tag color="default"    icon={<ClockCircleOutlined />}>待立案</Tag>,
  SUBMITTED_REG:       <Tag color="processing" icon={<SyncOutlined spin />}>待立案审核</Tag>,
  REG_APPROVED:        <Tag color="blue">立案通过</Tag>,
  SUBMITTED_AGREEMENT: <Tag color="processing" icon={<SyncOutlined spin />}>待协议审核</Tag>,
  AGREEMENT_APPROVED:  <Tag color="cyan">协议通过</Tag>,
  SUBMITTED_SURVEY:    <Tag color="processing" icon={<SyncOutlined spin />}>待定损审核</Tag>,
  SURVEY_APPROVED:     <Tag color="geekblue">定损通过</Tag>,
  DONE:                <Tag color="success"    icon={<CheckCircleOutlined />}>已结案</Tag>,
};

// ─── 6 个任务池定义 ──────────────────────────────────────────────────────────
interface PoolDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  /**
   * 任务池过滤条件：
   * - caseStatus: 案件必须处于的状态
   * - taskTypes: 展示哪些类型的子任务（据此对应'条线'）
   */
  caseStatus: string;
  taskTypes: Array<'rider_injury' | 'third_injury' | 'third_vehicle' | 'third_property'>;
  /** 操作员侧（查勘员 or 审核员） */
  side: 'surveyor' | 'auditor';
  /** 适用角色 */
  roles: string[];
}

const POOL_DEFS: PoolDef[] = [
  {
    key: 'injury_surveyor_reg',
    label: '人伤·待立案申请',
    icon: <MedicineBoxOutlined />,
    caseStatus: 'PENDING',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'surveyor',
    roles: ['ADMIN', 'INJURY_SURVEYOR'],
  },
  {
    key: 'injury_surveyor_agreement',
    label: '人伤·待协议上报',
    icon: <MedicineBoxOutlined />,
    caseStatus: 'REG_APPROVED',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'surveyor',
    roles: ['ADMIN', 'INJURY_SURVEYOR'],
  },
  {
    key: 'injury_surveyor_survey',
    label: '人伤·待定损提交',
    icon: <MedicineBoxOutlined />,
    caseStatus: 'AGREEMENT_APPROVED',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'surveyor',
    roles: ['ADMIN', 'INJURY_SURVEYOR'],
  },
  {
    key: 'injury_auditor_reg',
    label: '人伤·待立案审核',
    icon: <AuditOutlined />,
    caseStatus: 'SUBMITTED_REG',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'auditor',
    roles: ['ADMIN', 'INJURY_AUDITOR'],
  },
  {
    key: 'injury_auditor_agreement',
    label: '人伤·待协议审核',
    icon: <AuditOutlined />,
    caseStatus: 'SUBMITTED_AGREEMENT',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'auditor',
    roles: ['ADMIN', 'INJURY_AUDITOR'],
  },
  {
    key: 'injury_auditor_survey',
    label: '人伤·待定损审核',
    icon: <AuditOutlined />,
    caseStatus: 'SUBMITTED_SURVEY',
    taskTypes: ['rider_injury', 'third_injury'],
    side: 'auditor',
    roles: ['ADMIN', 'INJURY_AUDITOR'],
  },
  {
    key: 'property_surveyor_reg',
    label: '物损·待立案申请',
    icon: <CarOutlined />,
    caseStatus: 'PENDING',
    taskTypes: ['third_property'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'property_surveyor_agreement',
    label: '物损·待协议上报',
    icon: <CarOutlined />,
    caseStatus: 'REG_APPROVED',
    taskTypes: ['third_property'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'property_surveyor_survey',
    label: '物损·待定损提交',
    icon: <CarOutlined />,
    caseStatus: 'AGREEMENT_APPROVED',
    taskTypes: ['third_property'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'property_auditor_reg',
    label: '物损·待立案审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_REG',
    taskTypes: ['third_property'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
  {
    key: 'property_auditor_agreement',
    label: '物损·待协议审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_AGREEMENT',
    taskTypes: ['third_property'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
  {
    key: 'property_auditor_survey',
    label: '物损·待定损审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_SURVEY',
    taskTypes: ['third_property'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
  // ─── 车损流（独立任务流）─────────────────────────────────────────────
  {
    key: 'vehicle_surveyor_reg',
    label: '车损·待立案申请',
    icon: <CarOutlined />,
    caseStatus: 'PENDING',
    taskTypes: ['third_vehicle'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'vehicle_surveyor_agreement',
    label: '车损·待协议上报',
    icon: <CarOutlined />,
    caseStatus: 'REG_APPROVED',
    taskTypes: ['third_vehicle'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'vehicle_surveyor_survey',
    label: '车损·待定损提交',
    icon: <CarOutlined />,
    caseStatus: 'AGREEMENT_APPROVED',
    taskTypes: ['third_vehicle'],
    side: 'surveyor',
    roles: ['ADMIN', 'PROPERTY_SURVEYOR'],
  },
  {
    key: 'vehicle_auditor_reg',
    label: '车损·待立案审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_REG',
    taskTypes: ['third_vehicle'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
  {
    key: 'vehicle_auditor_agreement',
    label: '车损·待协议审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_AGREEMENT',
    taskTypes: ['third_vehicle'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
  {
    key: 'vehicle_auditor_survey',
    label: '车损·待定损审核',
    icon: <FileSearchOutlined />,
    caseStatus: 'SUBMITTED_SURVEY',
    taskTypes: ['third_vehicle'],
    side: 'auditor',
    roles: ['ADMIN', 'PROPERTY_AUDITOR'],
  },
];

// ─── 每个任务池的表格行数据结构（任务维度，每行一个子任务）─────────────────────
interface PoolRow {
  key: string;         // taskId
  caseId: string;
  caseNo: string;
  riderName: string;
  riderType: string;   // 专送 / 众包
  company: string;     // 归属公司
  vehicleLabel: string;
  accidentTime: string;
  reportTime: string;
  taskType: string;    // rider_injury | third_injury | third_property
  taskFlowStatus: string;
  hasLitigation: boolean;
  investigationBlocking: boolean;
}

function buildPoolRows(pool: PoolDef, cases: ClaimCase[]): PoolRow[] {
  const rows: PoolRow[] = [];
  cases
    .forEach(c => {
      c.tasks
        .filter(t => (pool.taskTypes as string[]).includes(t.task_type) && t.status === pool.caseStatus)
        .forEach(t => {
          rows.push({
            key: t.id,
            caseId: c.id,
            caseNo: c.case_no,
            riderName: c.rider_name,
            riderType: c.rider_type,
            company: c.company,
            vehicleLabel: c.vehicle_label,
            accidentTime: c.accident_time,
            reportTime: c.report_time,
            taskType: t.task_type,
            taskFlowStatus: deriveTaskFlowStatus(t),
            hasLitigation: c.has_litigation,
            investigationBlocking: c.investigation_blocking,
          });
        });
    });
  return rows;
}

const INJURY_TYPE_TAG: Record<string, React.ReactNode> = {
  rider_injury: <Tag color="orange">骑手人伤</Tag>,
  third_injury: <Tag color="geekblue">三者人伤</Tag>,
  third_vehicle: <Tag color="volcano">三者车损</Tag>,
  third_property: <Tag color="purple">三者物损</Tag>,
};

function PoolTable({ pool, navigate, cases }: { pool: PoolDef; navigate: (path: string) => void; cases: ClaimCase[] }) {
  const rows = useMemo(() => buildPoolRows(pool, cases), [pool, cases]);

  // 只有人伤任务池才显示「人伤类型」列；骑手类型/归属公司/报案时间所有池都显示
  const isInjuryPool = pool.taskTypes.every(t => t !== 'third_property');

  const columns = [
    {
      title: '案件号',
      dataIndex: 'caseNo',
      width: 160,
      sorter: (a: PoolRow, b: PoolRow) => (a.caseNo || '').localeCompare(b.caseNo || ''),
      defaultSortOrder: 'ascend' as const,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: '骑手', dataIndex: 'riderName', width: 80 },
    {
      title: '骑手类型',
      dataIndex: 'riderType',
      width: 90,
      render: (v: string) => <Tag color={v === '专送' ? 'blue' : 'cyan'}>{v}</Tag>,
    },
    { title: '归属公司', dataIndex: 'company', width: 120 },
    { title: '标的车', dataIndex: 'vehicleLabel', width: 180 },
    {
      title: '任务状态',
      dataIndex: 'taskFlowStatus',
      width: 100,
      render: (v: string) => (
        <Tag color={TASK_FLOW_STATUS_COLOR[v as keyof typeof TASK_FLOW_STATUS_COLOR] || 'default'}>
          {TASK_FLOW_STATUS_LABEL[v as keyof typeof TASK_FLOW_STATUS_LABEL] || v}
        </Tag>
      ),
    },
    { title: '出险时间', dataIndex: 'accidentTime', width: 150 },
    { title: '报案时间', dataIndex: 'reportTime', width: 150 },
    ...(isInjuryPool ? [
      {
        title: '人伤类型',
        dataIndex: 'taskType',
        width: 100,
        render: (v: string) => INJURY_TYPE_TAG[v] ?? <Tag>{v}</Tag>,
      },
    ] : []),
  ];

  return (
    <Table
      dataSource={rows}
      columns={columns}
      rowKey="key"
      pagination={false}
      size="small"
      locale={{ emptyText: '该任务池当前无待办任务' }}
      onRow={(row) => ({
        onClick: () => navigate(`/cases/${row.caseId}?taskId=${row.key}`),
        style: { cursor: 'pointer' },
      })}
    />
  );
}

interface CustomerSplitRow {
  key: string;
  caseId: string;
  caseNo: string;
  riderName: string;
  company: string;
  vehicleLabel: string;
  accidentTime: string;
  reportTime: string;
}

function CustomerSplitTable({ navigate, cases }: { navigate: (path: string) => void; cases: ClaimCase[] }) {
  const rows: CustomerSplitRow[] = cases
    .filter((c) => c.status === 'PENDING_SPLIT')
    .map((c) => ({
      key: c.id,
      caseId: c.id,
      caseNo: c.case_no,
      riderName: c.rider_name,
      company: c.company,
      vehicleLabel: c.vehicle_label,
      accidentTime: c.accident_time,
      reportTime: c.report_time,
    }));

  const columns = [
    {
      title: '报案号',
      dataIndex: 'caseNo',
      width: 180,
      sorter: (a: CustomerSplitRow, b: CustomerSplitRow) => (a.caseNo || '').localeCompare(b.caseNo || ''),
      defaultSortOrder: 'ascend' as const,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: '骑手', dataIndex: 'riderName', width: 90 },
    { title: '归属公司', dataIndex: 'company', width: 130 },
    { title: '标的车', dataIndex: 'vehicleLabel', width: 200 },
    { title: '出险时间', dataIndex: 'accidentTime', width: 170 },
    { title: '报案时间', dataIndex: 'reportTime', width: 170 },
    {
      title: '状态',
      width: 100,
      render: () => STATUS_TAG.PENDING_SPLIT,
    },
  ];

  return (
    <Table
      dataSource={rows}
      columns={columns}
      rowKey="key"
      pagination={false}
      size="small"
      locale={{ emptyText: '当前无待分流报案' }}
      onRow={(row) => ({
        onClick: () => navigate(`/cases/${row.caseId}`),
        style: { cursor: 'pointer' },
      })}
    />
  );
}

// ─── 顶层统计卡片数据 ────────────────────────────────────────────────────────
function getStats(role: string, cases: ClaimCase[]) {
  const countTasks = (
    taskTypes: Array<'rider_injury' | 'third_injury' | 'third_vehicle' | 'third_property'>,
    statuses: string[]
  ) => cases.reduce((sum, claim) => {
    const matched = claim.tasks.filter(
      (task) => taskTypes.includes(task.task_type) && statuses.includes(task.status)
    );
    return sum + matched.length;
  }, 0);

  if (role === 'CUSTOMER_SERVICE') {
    const splitPendingCases = cases.filter(c => c.status === 'PENDING_SPLIT');
    return [
      { title: '待分流报案', value: splitPendingCases.length, color: '#faad14' },
      { title: '已分流案件', value: cases.filter(c => c.status !== 'PENDING_SPLIT').length, color: '#1890ff' },
      { title: '进行中案件', value: cases.filter(c => c.status !== 'PENDING_SPLIT' && c.status !== 'DONE').length, color: '#722ed1' },
      { title: '本月报案', value: cases.length, color: '#52c41a' },
    ];
  }
  if (role === 'ADMIN') {
    return [
      { title: '全量案件', value: cases.length, color: '#1890ff' },
      { title: '进行中案件', value: cases.filter(c => c.status !== 'DONE').length, color: '#faad14' },
      { title: '诉讼挂起', value: cases.filter(c => c.has_litigation).length, color: '#ff4d4f' },
      { title: '本月报案', value: cases.length, color: '#52c41a' },
    ];
  }
  if (role === 'INJURY_SURVEYOR') {
    const injuryTypes: Array<'rider_injury' | 'third_injury'> = ['rider_injury', 'third_injury'];
    return [
      { title: '待立案申请', value: countTasks(injuryTypes, ['PENDING']), color: '#faad14' },
      { title: '待协议上报', value: countTasks(injuryTypes, ['REG_APPROVED']), color: '#1890ff' },
      { title: '待定损提交', value: countTasks(injuryTypes, ['AGREEMENT_APPROVED']), color: '#722ed1' },
      { title: '本月处理', value: countTasks(injuryTypes, ['PENDING', 'REG_APPROVED', 'AGREEMENT_APPROVED']), color: '#52c41a' },
    ];
  }
  if (role === 'INJURY_AUDITOR') {
    const injuryTypes: Array<'rider_injury' | 'third_injury'> = ['rider_injury', 'third_injury'];
    return [
      { title: '待立案审核', value: countTasks(injuryTypes, ['SUBMITTED_REG']), color: '#faad14' },
      { title: '待协议审核', value: countTasks(injuryTypes, ['SUBMITTED_AGREEMENT']), color: '#1890ff' },
      { title: '待定损审核', value: countTasks(injuryTypes, ['SUBMITTED_SURVEY']), color: '#722ed1' },
      { title: '本月审核', value: countTasks(injuryTypes, ['SUBMITTED_REG', 'SUBMITTED_AGREEMENT', 'SUBMITTED_SURVEY']), color: '#52c41a' },
    ];
  }
  if (role === 'PROPERTY_SURVEYOR') {
    const propertyTypes: Array<'third_vehicle' | 'third_property'> = ['third_vehicle', 'third_property'];
    return [
      { title: '待立案申请', value: countTasks(propertyTypes, ['PENDING']), color: '#faad14' },
      { title: '待协议上报', value: countTasks(propertyTypes, ['REG_APPROVED']), color: '#1890ff' },
      { title: '待定损提交', value: countTasks(propertyTypes, ['AGREEMENT_APPROVED']), color: '#722ed1' },
      { title: '本月处理', value: countTasks(propertyTypes, ['PENDING', 'REG_APPROVED', 'AGREEMENT_APPROVED']), color: '#52c41a' },
    ];
  }
  if (role === 'PROPERTY_AUDITOR') {
    const propertyTypes: Array<'third_vehicle' | 'third_property'> = ['third_vehicle', 'third_property'];
    return [
      { title: '待立案审核', value: countTasks(propertyTypes, ['SUBMITTED_REG']), color: '#faad14' },
      { title: '待协议审核', value: countTasks(propertyTypes, ['SUBMITTED_AGREEMENT']), color: '#1890ff' },
      { title: '待定损审核', value: countTasks(propertyTypes, ['SUBMITTED_SURVEY']), color: '#722ed1' },
      { title: '本月审核', value: countTasks(propertyTypes, ['SUBMITTED_REG', 'SUBMITTED_AGREEMENT', 'SUBMITTED_SURVEY']), color: '#52c41a' },
    ];
  }
  return [];
}

// ─── 主组件 ─────────────────────────────────────────────────────────────────
export default function Dashboard({ workbenchKey }: { workbenchKey?: import('../utils/constants').WorkbenchKey } = {}) {
  const navigate = useNavigate();
  const { role } = useContext(RoleContext);
  const [cases, setCases] = useState<ClaimCase[]>([]);

  useEffect(() => {
    api.getClaims().then((items) => {
      setCases(items.map((item) => ({
        ...item,
        status: deriveCaseStatusFromTasks(item.tasks, item.status),
      })));
    }).catch((error) => {
      message.error(`获取看板数据失败：${error.message}`);
    });
  }, []);

  // 当前角色可见的任务池
  const visiblePools = POOL_DEFS.filter(p => p.roles.includes(role));

  // 统计任务池中的待办数量（用于 Tab badge）
  const poolCounts = useMemo(
    () => Object.fromEntries(visiblePools.map(p => [p.key, buildPoolRows(p, cases).length])),
    [visiblePools, cases]
  );

  // 默认激活的 tab：第一个有任务的池，否则第一个
  const defaultTab = visiblePools.find(p => poolCounts[p.key] > 0)?.key || visiblePools[0]?.key;

  // 统计卡片
  const stats = getStats(role, cases);

  // 管理员看两个大分组；其他角色直接渲染各自的 3 个 tab
  const isAdmin = role === 'ADMIN';

  // Admin 分组显示：人伤条线 / 车损条线 / 物损条线（3 个分组，每组 3 个 tab）
  const injuryPools    = visiblePools.filter(p => p.taskTypes.some(t => t !== 'third_property' && t !== 'third_vehicle'));
  const vehiclePools   = visiblePools.filter(p => p.taskTypes.every(t => t === 'third_vehicle'));
  const propertyPools  = visiblePools.filter(p => p.taskTypes.every(t => t === 'third_property'));

  const buildTabItems = (pools: PoolDef[]) =>
    pools.map(pool => ({
      key: pool.key,
      label: (
        <Space size={4}>
          {pool.icon}
          {pool.label}
          {poolCounts[pool.key] > 0 && (
            <Badge count={poolCounts[pool.key]} size="small" />
          )}
        </Space>
      ),
      children: <PoolTable pool={pool} navigate={navigate} cases={cases} />,
    }));

  const ROLE_LABEL: Record<string, string> = {
    CUSTOMER_SERVICE: '客服专员·受理任务池',
    ADMIN: '全局任务看板',
    INJURY_SURVEYOR: '人伤条线·查勘员任务池',
    INJURY_AUDITOR: '人伤条线·审核员任务池',
    PROPERTY_SURVEYOR: '物损条线·查勘员任务池',
    PROPERTY_AUDITOR: '物损条线·审核员任务池',
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      {/* ── 统计卡片 ── */}
      <Row gutter={16}>
        {stats.map(s => (
          <Col span={6} key={s.title}>
            <Card bordered={false}>
              <Statistic title={s.title} value={s.value} valueStyle={{ color: s.color }} suffix="件" />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ── 任务池（Tab 分层）── */}
      {role === 'CUSTOMER_SERVICE' ? (
        <Card
          title="客服专员·待分流报案池"
          bordered={false}
          extra={
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/create')}>
              新建报案
            </Button>
          }
        >
          <CustomerSplitTable navigate={navigate} cases={cases} />
        </Card>
      ) : isAdmin ? (
        // 管理员：3 个分组 Card（人伤 / 车损 / 物损），每组内 Tab
        <Row gutter={16}>
          <Col span={8}>
            <Card
              title={<Space><MedicineBoxOutlined style={{ color: '#2db7f5' }} /><span>人伤条线任务池</span></Space>}
              bordered={false}
              bodyStyle={{ padding: '8px 0' }}
              extra={<Button size="small" type="primary" onClick={() => navigate('/create')}>新建报案</Button>}
            >
              <Tabs
                size="small"
                defaultActiveKey={injuryPools[0]?.key}
                items={buildTabItems(injuryPools)}
                style={{ padding: '0 16px 8px' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card
              title={<Space><CarOutlined style={{ color: '#fa541c' }} /><span>车损条线任务池</span></Space>}
              bordered={false}
              bodyStyle={{ padding: '8px 0' }}
            >
              <Tabs
                size="small"
                defaultActiveKey={vehiclePools[0]?.key}
                items={buildTabItems(vehiclePools)}
                style={{ padding: '0 16px 8px' }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card
              title={<Space><CarOutlined style={{ color: '#722ed1' }} /><span>物损条线任务池</span></Space>}
              bordered={false}
              bodyStyle={{ padding: '8px 0' }}
            >
              <Tabs
                size="small"
                defaultActiveKey={propertyPools[0]?.key}
                items={buildTabItems(propertyPools)}
                style={{ padding: '0 16px 8px' }}
              />
            </Card>
          </Col>
        </Row>
      ) : (
        // 非管理员：单 Card + 3 个 Tab
        <Card
          title={ROLE_LABEL[role] || '我的任务池'}
          bordered={false}
          bodyStyle={{ padding: '8px 0' }}
          extra={
            (role === 'CUSTOMER_SERVICE' || role === 'INJURY_SURVEYOR' || role === 'PROPERTY_SURVEYOR') && (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/create')}>
                新建报案
              </Button>
            )
          }
        >
          <Tabs
            defaultActiveKey={defaultTab}
            items={buildTabItems(visiblePools)}
            style={{ padding: '0 16px 8px' }}
            tabBarStyle={{ marginBottom: 8 }}
          />
        </Card>
      )}
    </Space>
  );
}


