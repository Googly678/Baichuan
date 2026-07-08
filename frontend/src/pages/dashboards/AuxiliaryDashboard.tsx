/**
 * 辅助任务工作台
 * - 列出所有 auxiliary_tasks（统一表）
 * - 列出复勘 / 调查旧表数据（标 deprecated）
 * - 提供审核/完结操作
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Table, Tag, Button, Space, Row, Col, Statistic, message, Select, Input,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import {
  AuditOutlined, ReloadOutlined, PlusOutlined, ToolOutlined,
} from '@ant-design/icons';
import { api, type AuxiliaryTask, type AuxiliaryType, type AuxiliaryStatus } from '../../utils/api';

const TYPE_TAG: Record<AuxiliaryType, { color: string; label: string }> = {
  RE_INSPECTION: { color: 'blue',    label: '复勘' },
  INVESTIGATION:  { color: 'volcano', label: '调查' },
};
const STATUS_TAG: Record<AuxiliaryStatus, { color: string; label: string }> = {
  PENDING:     { color: 'default',  label: '待处理' },
  UNDER_REVIEW:{ color: 'processing', label: '审核中' },
  COMPLETED:   { color: 'green',    label: '已完结' },
  REJECTED:    { color: 'red',      label: '已退回' },
};

export default function AuxiliaryDashboard() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AuxiliaryTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AuxiliaryType | undefined>();
  const [statusFilter, setStatusFilter] = useState<AuxiliaryStatus | undefined>();
  const [keyword, setKeyword] = useState('');

  const reload = () => {
    setLoading(true);
    api.auxiliaryTasks.list({
      auxiliary_type: typeFilter,
      status: statusFilter,
    })
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => message.error(`加载补充任务失败：${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [typeFilter, statusFilter]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return items;
    return items.filter((it) =>
      it.case_no?.toLowerCase().includes(k) ||
      it.title?.toLowerCase().includes(k) ||
      it.reason?.toLowerCase().includes(k) ||
      it.operator?.toLowerCase().includes(k)
    );
  }, [items, keyword]);

  const stats = {
    total: items.length,
    pending: items.filter((i) => i.status === 'PENDING' || i.status === 'UNDER_REVIEW').length,
    blocking: items.filter((i) => i.blocking && (i.status === 'PENDING' || i.status === 'UNDER_REVIEW')).length,
    completed: items.filter((i) => i.status === 'COMPLETED').length,
  };

  const columns = [
    { title: '任务ID', dataIndex: 'id', width: 110, render: (v: string) => v.slice(-8) },
    { title: '案件号', dataIndex: 'case_no', width: 150 },
    {
      title: '类型', dataIndex: 'auxiliary_type', width: 80,
      render: (v: AuxiliaryType) => <Tag color={TYPE_TAG[v]?.color}>{TYPE_TAG[v]?.label || v}</Tag>,
    },
    { title: '标题', dataIndex: 'title', ellipsis: true },
    { title: '原因', dataIndex: 'reason', ellipsis: true, width: 200 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: AuxiliaryStatus) => <Tag color={STATUS_TAG[v]?.color}>{STATUS_TAG[v]?.label || v}</Tag>,
    },
    {
      title: '阻塞主任务', dataIndex: 'blocking', width: 90,
      render: (v: boolean) => v ? <Tag color="red">阻塞</Tag> : <Tag>否</Tag>,
    },
    { title: '发起人', dataIndex: 'operator', width: 110 },
    { title: '审核人', dataIndex: 'reviewer', width: 110 },
    { title: '创建时间', dataIndex: 'created_at', width: 160 },
    {
      title: '操作', width: 220, fixed: 'right' as const,
      render: (_: any, row: AuxiliaryTask) => (
        <Space size="small">
          <Button
            type="link" size="small"
            onClick={() => navigate(`/cases/${row.case_id}?taskId=${row.case_task_id || ''}`)}
          >
            查看案件
          </Button>
          {row.status === 'PENDING' && (
            <Button type="link" size="small" onClick={() => updateStatus(row, 'UNDER_REVIEW')}>
              提交审核
            </Button>
          )}
          {row.status === 'UNDER_REVIEW' && (
            <>
              <Button type="link" size="small" onClick={() => updateStatus(row, 'COMPLETED')}>
                完结
              </Button>
              <Button type="link" size="small" danger onClick={() => updateStatus(row, 'REJECTED')}>
                退回
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const updateStatus = async (row: AuxiliaryTask, status: AuxiliaryStatus) => {
    try {
      await api.auxiliaryTasks.update(row.id, { status });
      message.success(`${row.id} → ${STATUS_TAG[status]?.label}`);
      reload();
    } catch (err: any) {
      message.error(`操作失败：${err.message}`);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Row gutter={16}>
        <Col span={6}><Card bordered={false}><Statistic title="补充任务总数" value={stats.total} suffix="件" valueStyle={{ color: '#1890ff' }} /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="待处理" value={stats.pending} suffix="件" valueStyle={{ color: '#faad14' }} /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="阻塞主任务" value={stats.blocking} suffix="件" valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card bordered={false}><Statistic title="已完结" value={stats.completed} suffix="件" valueStyle={{ color: '#52c41a' }} /></Card></Col>
      </Row>

      <Card
        title={<Space><ToolOutlined style={{ color: '#fa8c16' }} /><b>补充任务列表</b></Space>}
        bordered={false}
        extra={
          <Space>
            <Select
              size="small" style={{ width: 110 }} allowClear
              placeholder="类型" value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              options={[
                { value: 'RE_INSPECTION', label: '复勘' },
                { value: 'INVESTIGATION', label: '调查' },
              ]}
            />
            <Select
              size="small" style={{ width: 110 }} allowClear
              placeholder="状态" value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={Object.entries(STATUS_TAG).map(([k, v]) => ({ value: k, label: v.label }))}
            />
            <Input.Search size="small" style={{ width: 200 }} placeholder="搜索案件/标题/原因" onChange={(e) => setKeyword(e.target.value)} />
            <Button size="small" icon={<ReloadOutlined />} onClick={reload}>刷新</Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => navigate('/re-inspection')}>
              旧版复勘（deprecated）
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1200 }}
          locale={{ emptyText: '暂无补充任务，可在案件详情页发起复勘/调查' }}
        />
      </Card>

      <Card
        title={<Space><AuditOutlined style={{ color: '#999' }} /><span style={{ color: '#999' }}>旧版辅助任务（deprecated）</span></Space>}
        bordered={false}
      >
        <Space>
          <Button size="small" onClick={() => navigate('/re-inspection')}>复勘管理（旧表）</Button>
          <Button size="small" onClick={() => navigate('/investigation')}>调查管理（旧表）</Button>
        </Space>
      </Card>
    </Space>
  );
}
