/**
 * 诉讼工作台
 * - 列出所有 has_litigation=true 的案件
 * - 列出所有诉讼记录（链接到 /litigation 旧页管理详情/编辑）
 * - 诉讼作业岗：新增诉讼入口
 * - 诉讼审核岗：判决录入
 * - 管理员：全权
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Tag, Button, Space, Row, Col, Statistic, message, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import { FileTextOutlined, PlusOutlined, AuditOutlined } from '@ant-design/icons';
import { api, type LitigationRecord } from '../../utils/api';
import type { ClaimCase } from '../../types/claim';
import { useContext } from 'react';
import { RoleContext } from '../../App';
import { TASK_STATUS_LABEL } from '../../utils/constants';

const LITIGATION_STATUS_TAG: Record<string, { color: string; label: string }> = {
  ACCEPTED:  { color: 'gold',     label: '已立案' },
  IN_TRIAL:  { color: 'processing', label: '审理中' },
  JUDGMENT:  { color: 'blue',     label: '已判决' },
  CLOSED:    { color: 'green',    label: '已结案' },
  WITHDRAWN: { color: 'default',  label: '已撤诉' },
};

export default function LitigationDashboard() {
  const navigate = useNavigate();
  const { role } = useContext(RoleContext);
  const [cases, setCases] = useState<ClaimCase[]>([]);
  const [litigations, setLitigations] = useState<LitigationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getClaims(), api.listLitigations()])
      .then(([cs, ls]) => {
        setCases(cs);
        // 旧 listLitigations 返回 {items: []}，新接口直接返回数组；做兼容
        const items = Array.isArray(ls) ? ls : (ls as any).items || [];
        setLitigations(items);
      })
      .catch((err) => message.error(`加载诉讼工作台失败：${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  // 当前处于诉讼态的案件
  const litigationCases = useMemo(
    () => cases.filter((c) => c.has_litigation || c.status === 'DONE' && c.litigation_judgment),
    [cases]
  );

  // 统计
  const stats = {
    totalLitigationCases: litigationCases.length,
    pendingLitigation:    litigations.filter((l) => l.status === 'ACCEPTED' || l.status === 'IN_TRIAL').length,
    closed:               litigations.filter((l) => l.status === 'CLOSED' || l.status === 'WITHDRAWN').length,
    totalLawyerFee:       litigations.reduce((s, l) => s + (l.lawyer_fee || 0), 0),
  };

  const caseColumns = [
    { title: '报案号', dataIndex: 'case_no', width: 180, render: (v: string) => <b>{v}</b> },
    { title: '骑手', dataIndex: 'rider_name', width: 90 },
    { title: '归属公司', dataIndex: 'company', width: 130 },
    {
      title: '案件状态', dataIndex: 'status', width: 100,
      render: (v: string) => <Tag color="magenta">{TASK_STATUS_LABEL[v] || v}</Tag>,
    },
    {
      title: '诉讼判决', dataIndex: 'litigation_judgment', width: 200,
      render: (v: string) => v ? <span style={{ color: '#52c41a' }}>{v}</span> : <span style={{ color: '#999' }}>—</span>,
    },
    {
      title: '实际赔款', dataIndex: 'actual_payout', width: 120,
      render: (v: number) => v ? `¥ ${v.toLocaleString()}` : '—',
    },
    { title: '出险时间', dataIndex: 'accident_time', width: 170 },
    {
      title: '操作', width: 100,
      render: (_: any, row: ClaimCase) => (
        <Button type="link" size="small" onClick={() => navigate(`/cases/${row.id}`)}>查看</Button>
      ),
    },
  ];

  const litigationColumns = [
    { title: '诉讼ID', dataIndex: 'id', width: 100, render: (v: string) => v.slice(-6) },
    { title: '报案号', dataIndex: 'case_no', width: 150 },
    { title: '受诉法院', dataIndex: 'court', width: 180, ellipsis: true },
    { title: '对方当事人', dataIndex: 'counterparty', width: 100 },
    {
      title: '代理形式', dataIndex: 'agent_type', width: 90,
      render: (v: string) => v === 'LAWYER' ? <Tag color="volcano">律师</Tag> : <Tag color="cyan">员工</Tag>,
    },
    { title: '代理律师', dataIndex: 'lawyer_name', width: 100 },
    { title: '诉请金额', dataIndex: 'claim_amount', width: 110, render: (v: number) => v ? `¥ ${v.toLocaleString()}` : '—' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => <Tag color={LITIGATION_STATUS_TAG[v]?.color}>{LITIGATION_STATUS_TAG[v]?.label || v}</Tag>,
    },
    { title: '立案日期', dataIndex: 'accepted_at', width: 110 },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Row gutter={16}>
        <Col span={6}><Card bordered={false}><Statistic title="诉讼中案件" value={stats.totalLitigationCases} valueStyle={{ color: '#eb2f96' }} suffix="件" /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="审理中" value={stats.pendingLitigation} valueStyle={{ color: '#faad14' }} suffix="件" /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="已结案/撤诉" value={stats.closed} valueStyle={{ color: '#52c41a' }} suffix="件" /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="累计律师费" value={stats.totalLawyerFee} valueStyle={{ color: '#722ed1' }} prefix="¥" /></Card></Col>
      </Row>

      <Card
        title={<Space><FileTextOutlined style={{ color: '#eb2f96' }} /><b>诉讼案件池</b></Space>}
        bordered={false}
        extra={
          (role === 'LITIGATION_OPERATOR' || role === 'ADMIN') && (
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => navigate('/litigation')}>
              新建诉讼登记
            </Button>
          )
        }
      >
        {litigationCases.length > 0 ? (
          <Table
            dataSource={litigationCases}
            columns={caseColumns}
            rowKey="id"
            size="small"
            loading={loading}
            pagination={false}
            locale={{ emptyText: '当前无诉讼中案件' }}
            onRow={(row) => ({ onClick: () => navigate(`/cases/${row.id}`), style: { cursor: 'pointer' } })}
          />
        ) : (
          <Empty description="当前无诉讼中案件" />
        )}
      </Card>

      <Card
        title={<Space><AuditOutlined style={{ color: '#eb2f96' }} /><b>诉讼登记记录</b></Space>}
        bordered={false}
        extra={
          <Button size="small" onClick={() => navigate('/litigation')}>打开完整管理</Button>
        }
      >
        <Table
          dataSource={litigations}
          columns={litigationColumns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 8, showSizeChanger: false }}
          onRow={(row) => ({ onClick: () => navigate(`/litigation`), style: { cursor: 'pointer' } })}
        />
      </Card>
    </Space>
  );
}
