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
  InputNumber,
  message,
  Popconfirm,
  Row,
  Col,
  Input as AntInput,
} from 'antd';
import { PlusOutlined, ReloadOutlined, EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { api, LitigationRecord, LitigationStatus, LitigationRole } from '../utils/api';

const STATUS_OPTIONS: { value: LitigationStatus; label: string; color: string }[] = [
  { value: 'ACCEPTED',  label: '已立案', color: 'processing' },
  { value: 'IN_TRIAL',  label: '审理中', color: 'blue' },
  { value: 'JUDGMENT',  label: '已判决', color: 'geekblue' },
  { value: 'CLOSED',    label: '已结案', color: 'success' },
  { value: 'WITHDRAWN', label: '已撤诉', color: 'warning' },
];

const STATUS_MAP: Record<LitigationStatus, { color: string; label: string }> = STATUS_OPTIONS.reduce(
  (acc, cur) => ({ ...acc, [cur.value]: { color: cur.color, label: cur.label } }),
  {} as any
);

const ROLE_OPTIONS: { value: LitigationRole; label: string }[] = [
  { value: 'PLAINTIFF',    label: '原告（我方起诉）' },
  { value: 'DEFENDANT',    label: '被告（被诉）' },
  { value: 'THIRD_PARTY',  label: '第三人' },
];

const ROLE_LABEL: Record<LitigationRole, string> = ROLE_OPTIONS.reduce(
  (acc, cur) => ({ ...acc, [cur.value]: cur.label }),
  {} as any
);

function toDayjs(value?: string) {
  return value ? dayjs(value) : null;
}

export default function LitigationPage() {
  const [items, setItems] = useState<LitigationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<LitigationStatus | ''>('');
  const [filterRole, setFilterRole] = useState<LitigationRole | ''>('');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<LitigationRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<LitigationRecord | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { items: data } = await api.listLitigations();
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
      if (filterRole && it.role !== filterRole) return false;
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        return (
          it.case_no?.toLowerCase().includes(k) ||
          it.court?.toLowerCase().includes(k) ||
          it.case_court_no?.toLowerCase().includes(k) ||
          it.lawyer_name?.toLowerCase().includes(k) ||
          it.counterparty?.toLowerCase().includes(k) ||
          it.rider_name?.toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [items, filterStatus, filterRole, keyword]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ACCEPTED', role: 'DEFENDANT' });
    setDrawerOpen(true);
  };

  const openEdit = (record: LitigationRecord) => {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      accepted_at: toDayjs(record.accepted_at) || undefined,
      judgment_at: toDayjs(record.judgment_at) || undefined,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload: Partial<LitigationRecord> = {
        ...values,
        accepted_at: (values.accepted_at as Dayjs | undefined)?.toISOString(),
        judgment_at: (values.judgment_at as Dayjs | undefined)?.toISOString(),
      };
      if (editing) {
        await api.updateLitigation(editing.id, payload);
        message.success('诉讼登记已更新');
      } else {
        await api.createLitigation(payload);
        message.success('诉讼登记已创建');
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
      await api.deleteLitigation(id);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(`删除失败：${err.message}`);
    }
  };

  return (
    <Card
      title="诉讼登记管理"
      bordered={false}
      extra={
        <Space wrap>
          <AntInput.Search
            allowClear
            placeholder="报案号 / 法院 / 案号 / 律师"
            style={{ width: 260 }}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={setKeyword}
          />
          <Select
            placeholder="诉讼地位"
            allowClear
            style={{ width: 150 }}
            value={filterRole || undefined}
            onChange={(v) => setFilterRole((v || '') as LitigationRole | '')}
            options={ROLE_OPTIONS}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 130 }}
            value={filterStatus || undefined}
            onChange={(v) => setFilterStatus((v || '') as LitigationStatus | '')}
            options={STATUS_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建登记</Button>
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
          { title: '受诉法院', dataIndex: 'court', width: 180, ellipsis: true },
          { title: '法院案号', dataIndex: 'case_court_no', width: 150 },
          {
            title: '诉讼地位',
            dataIndex: 'role',
            width: 140,
            render: (v: LitigationRole) => <Tag>{ROLE_LABEL[v] || v}</Tag>,
          },
          {
            title: '诉请金额',
            dataIndex: 'claim_amount',
            width: 130,
            render: (v?: number) => (v === undefined || v === null ? '—' : `¥ ${Number(v).toLocaleString()}`),
          },
          {
            title: '立案日期',
            dataIndex: 'accepted_at',
            width: 120,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: LitigationStatus) => {
              const meta = STATUS_MAP[v] || { color: 'default', label: v };
              return <Tag color={meta.color}>{meta.label}</Tag>;
            },
          },
          {
            title: '操作',
            fixed: 'right',
            width: 200,
            render: (_, record) => (
              <Space size="small">
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => setViewing(record)}>详情</Button>
                <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title="确认删除该诉讼登记？" onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editing ? '编辑诉讼登记' : '新建诉讼登记'}
        width={620}
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
              <Form.Item label="受诉法院" name="court" rules={[{ required: true, message: '请输入受诉法院' }]}>
                <Input placeholder="如：上海市浦东新区人民法院" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="法院案号" name="case_court_no">
                <Input placeholder="如：(2026)沪0115民初0001号" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="诉讼地位" name="role" rules={[{ required: true }]}>
                <Select options={ROLE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="立案日期" name="accepted_at">
                <DatePicker style={{ width: '100%' }} placeholder="请选择" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="诉请金额 (元)" name="claim_amount">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={1000}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(String(v || '').replace(/[^\d]/g, '')) as any}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="对方当事人" name="counterparty">
                <Input placeholder="如：张三" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="代理形式" name="agent_type" initialValue="STAFF">
                <Select
                  options={[
                    { value: 'STAFF',  label: '员工代理' },
                    { value: 'LAWYER', label: '律师代理' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="代理律师" name="lawyer_name">
                <Input placeholder="律师代理时必填" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="律师代理费 (元)" name="lawyer_fee">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={500}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(String(v || '').replace(/[^\d]/g, '')) as any}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="诉讼费 (元)" name="court_fee">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={100}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(String(v || '').replace(/[^\d]/g, '')) as any}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="判决日期" name="judgment_at">
                <DatePicker style={{ width: '100%' }} placeholder="请选择" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="诉讼状态" name="status" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="判决金额 (元)" name="judgment_amount">
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  step={1000}
                  formatter={(v) => `¥ ${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(v) => Number(String(v || '').replace(/[^\d]/g, '')) as any}
                />
              </Form.Item>
            </Col>
            <Col span={12} />
          </Row>
          <Form.Item label="判决结果概述" name="judgment_summary">
            <Input.TextArea rows={3} placeholder="判决后填写" />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="诉讼登记详情"
        width={520}
        open={!!viewing}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div>
            <Field label="报案号" value={viewing.case_no} />
            <Field label="骑手" value={viewing.rider_name || '—'} />
            <Field label="受诉法院" value={viewing.court} />
            <Field label="法院案号" value={viewing.case_court_no || '—'} />
            <Field label="诉讼地位" value={<Tag>{ROLE_LABEL[viewing.role] || viewing.role}</Tag>} />
            <Field
              label="立案日期"
              value={viewing.accepted_at ? dayjs(viewing.accepted_at).format('YYYY-MM-DD') : '—'}
            />
            <Field
              label="诉请金额"
              value={viewing.claim_amount === undefined || viewing.claim_amount === null ? '—' : `¥ ${Number(viewing.claim_amount).toLocaleString()}`}
            />
            <Field label="对方当事人" value={viewing.counterparty || '—'} />
            <Field label="代理形式" value={viewing.agent_type === 'LAWYER' ? '律师代理' : viewing.agent_type === 'STAFF' ? '员工代理' : '—'} />
            <Field label="代理律师" value={viewing.lawyer_name || '—'} />
            <Field
              label="律师代理费"
              value={viewing.lawyer_fee === undefined || viewing.lawyer_fee === null ? '—' : `¥ ${Number(viewing.lawyer_fee).toLocaleString()}`}
            />
            <Field
              label="诉讼费"
              value={viewing.court_fee === undefined || viewing.court_fee === null ? '—' : `¥ ${Number(viewing.court_fee).toLocaleString()}`}
            />
            <Field
              label="判决日期"
              value={viewing.judgment_at ? dayjs(viewing.judgment_at).format('YYYY-MM-DD') : '—'}
            />
            <Field
              label="判决金额"
              value={viewing.judgment_amount === undefined || viewing.judgment_amount === null ? '—' : `¥ ${Number(viewing.judgment_amount).toLocaleString()}`}
            />
            <Field
              label="状态"
              value={<Tag color={STATUS_MAP[viewing.status]?.color}>{STATUS_MAP[viewing.status]?.label || viewing.status}</Tag>}
            />
            <Field label="判决结果概述" value={viewing.judgment_summary || '—'} />
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
