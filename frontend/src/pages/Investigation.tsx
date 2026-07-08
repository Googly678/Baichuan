import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Drawer,
  Form,
  Input,
  Select,
  DatePicker,
  Switch,
  message,
  Popconfirm,
  Row,
  Col,
  Input as AntInput,
} from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api, InvestigationTask, InvestigationStatus, InvestigationType } from '../utils/api';

const STATUS_OPTIONS: { value: InvestigationStatus; label: string; color: string }[] = [
  { value: 'PENDING',     label: '待派单', color: 'default' },
  { value: 'IN_PROGRESS', label: '调查中', color: 'processing' },
  { value: 'COMPLETED',   label: '已完成', color: 'success' },
  { value: 'CANCELLED',   label: '已取消', color: 'warning' },
];

const STATUS_MAP: Record<InvestigationStatus, { color: string; label: string }> = STATUS_OPTIONS.reduce(
  (acc, cur) => ({ ...acc, [cur.value]: { color: cur.color, label: cur.label } }),
  {} as any
);

const TYPE_OPTIONS: { value: InvestigationType; label: string }[] = [
  { value: 'FIELD',          label: '现场调查' },
  { value: 'INTERVIEW',      label: '走访询问' },
  { value: 'EVIDENCE',       label: '证据收集' },
  { value: 'PUBLIC_SECURITY', label: '公安调取' },
  { value: 'OTHER',          label: '其他' },
];

const TYPE_LABEL: Record<InvestigationType, string> = TYPE_OPTIONS.reduce(
  (acc, cur) => ({ ...acc, [cur.value]: cur.label }),
  {} as any
);

function toDayjs(value?: string) {
  return value ? dayjs(value) : null;
}

export default function InvestigationPage() {
  const [items, setItems] = useState<InvestigationTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<InvestigationStatus | ''>('');
  const [filterType, setFilterType] = useState<InvestigationType | ''>('');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<InvestigationTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<InvestigationTask | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { items: data } = await api.listInvestigations();
      setItems(data);
    } catch (err: any) {
      message.error(`加载失败：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterStatus && it.status !== filterStatus) return false;
      if (filterType && it.investigation_type !== filterType) return false;
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        return (
          it.case_no?.toLowerCase().includes(k) ||
          it.investigator?.toLowerCase().includes(k) ||
          it.rider_name?.toLowerCase().includes(k) ||
          it.target?.toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [items, filterStatus, filterType, keyword]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'PENDING', investigation_type: 'FIELD', blocking: false });
    setDrawerOpen(true);
  };

  const openEdit = (record: InvestigationTask) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      scheduled_at: toDayjs(record.scheduled_at) || undefined,
      completed_at: toDayjs(record.completed_at) || undefined,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Partial<InvestigationTask> = {
        ...values,
        scheduled_at: (values.scheduled_at as Dayjs | undefined)?.toISOString(),
        completed_at: (values.completed_at as Dayjs | undefined)?.toISOString(),
      };
      if (editing) {
        await api.updateInvestigation(editing.id, payload);
        message.success('调查任务已更新');
      } else {
        await api.createInvestigation(payload);
        message.success('调查任务已创建');
      }
      setDrawerOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`保存失败：${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteInvestigation(id);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(`删除失败：${err.message}`);
    }
  };

  return (
    <Card
      title="调查任务管理"
      bordered={false}
      extra={
        <Space wrap>
          <AntInput.Search
            allowClear
            placeholder="报案号 / 调查员 / 调查对象"
            style={{ width: 240 }}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={setKeyword}
          />
          <Select
            placeholder="调查类型"
            allowClear
            style={{ width: 140 }}
            value={filterType || undefined}
            onChange={(v) => setFilterType((v || '') as InvestigationType | '')}
            options={TYPE_OPTIONS}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 130 }}
            value={filterStatus || undefined}
            onChange={(v) => setFilterStatus((v || '') as InvestigationStatus | '')}
            options={STATUS_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建调查</Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        columns={[
          { title: '报案号', dataIndex: 'case_no', width: 170 },
          { title: '骑手', dataIndex: 'rider_name', width: 100 },
          {
            title: '调查类型',
            dataIndex: 'investigation_type',
            width: 110,
            render: (v: InvestigationType) => <Tag>{TYPE_LABEL[v] || v}</Tag>,
          },
          { title: '调查员', dataIndex: 'investigator', width: 110 },
          { title: '调查对象 / 目的', dataIndex: 'target', ellipsis: true },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: InvestigationStatus) => {
              const meta = STATUS_MAP[v] || { color: 'default', label: v };
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          {
            title: '阻塞结案',
            dataIndex: 'blocking',
            width: 90,
            render: (v: boolean) => (v ? <Tag color="red">是</Tag> : <Tag>否</Tag>),
          },
          {
            title: '创建时间',
            dataIndex: 'created_at',
            width: 160,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          {
            title: '操作',
            fixed: 'right',
            width: 200,
            render: (_, record) => (
              <Space size="small">
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setViewing(record)}>详情</Button>
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title="确认删除该调查任务？" onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editing ? '编辑调查任务' : '新建调查任务'}
        width={560}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnClose
        footer={
          <Space style={{ float: 'right' }}>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={handleSubmit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="报案号" name="case_no" rules={[{ required: true, message: '请输入报案号' }]}>
                <Input placeholder="如 CL202606030001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="骑手姓名" name="rider_name">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="调查类型" name="investigation_type" rules={[{ required: true }]}>
                <Select options={TYPE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="调查员" name="investigator" rules={[{ required: true, message: '请输入调查员' }]}>
                <Input placeholder="如：调查员-老王" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="调查对象 / 目的" name="target" rules={[{ required: true, message: '请填写调查对象或目的' }]}>
            <Input.TextArea rows={2} placeholder="如：对三者证人走访、核实出险经过" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="计划时间" name="scheduled_at">
                <DatePicker showTime style={{ width: '100%' }} placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="完成时间" name="completed_at">
                <DatePicker showTime style={{ width: '100%' }} placeholder="请选择" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="调查发现" name="finding">
            <Input.TextArea rows={3} placeholder="完成后填写" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="状态" name="status" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="阻塞结案" name="blocking" valuePropName="checked">
                <Switch checkedChildren="阻塞" unCheckedChildren="否" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="调查任务详情"
        width={520}
        open={!!viewing}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div>
            <Field label="报案号" value={viewing.case_no} />
            <Field label="骑手" value={viewing.rider_name || '—'} />
            <Field label="调查类型" value={<Tag>{TYPE_LABEL[viewing.investigation_type] || viewing.investigation_type}</Tag>} />
            <Field label="调查员" value={viewing.investigator} />
            <Field label="调查对象 / 目的" value={viewing.target} />
            <Field
              label="计划时间"
              value={viewing.scheduled_at ? dayjs(viewing.scheduled_at).format('YYYY-MM-DD HH:mm') : '—'}
            />
            <Field
              label="完成时间"
              value={viewing.completed_at ? dayjs(viewing.completed_at).format('YYYY-MM-DD HH:mm') : '—'}
            />
            <Field
              label="状态"
              value={<Tag color={STATUS_MAP[viewing.status]?.color}>{STATUS_MAP[viewing.status]?.label || viewing.status}</Tag>}
            />
            <Field label="是否阻塞结案" value={viewing.blocking ? <Tag color="red">是</Tag> : <Tag>否</Tag>} />
            <Field label="调查发现" value={viewing.finding || '—'} />
            <Field label="备注" value={viewing.remark || '—'} />
            <Field label="创建时间" value={dayjs(viewing.created_at).format('YYYY-MM-DD HH:mm')} />
            <Field label="更新时间" value={dayjs(viewing.updated_at).format('YYYY-MM-DD HH:mm')} />
          </div>
        )}
      </Drawer>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#999', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 2 }}>{value}</div>
    </div>
  );
}
