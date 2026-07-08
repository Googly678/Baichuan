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
import { api, ReInspectionTask, ReInspectionStatus } from '../utils/api';

const STATUS_OPTIONS: { value: ReInspectionStatus; label: string; color: string }[] = [
  { value: 'PENDING',     label: '待派单', color: 'default' },
  { value: 'IN_PROGRESS', label: '进行中', color: 'processing' },
  { value: 'COMPLETED',   label: '已完成', color: 'success' },
  { value: 'CANCELLED',   label: '已取消', color: 'warning' },
];

const STATUS_MAP: Record<ReInspectionStatus, { color: string; label: string }> = STATUS_OPTIONS.reduce(
  (acc, cur) => ({ ...acc, [cur.value]: { color: cur.color, label: cur.label } }),
  {} as any
);

function toDayjs(value?: string) {
  return value ? dayjs(value) : null;
}

export default function ReInspectionPage() {
  const [items, setItems] = useState<ReInspectionTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ReInspectionStatus | ''>('');
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<ReInspectionTask | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewing, setViewing] = useState<ReInspectionTask | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const { items: data } = await api.listReInspections();
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
      if (keyword) {
        const k = keyword.trim().toLowerCase();
        return (
          it.case_no?.toLowerCase().includes(k) ||
          it.inspector?.toLowerCase().includes(k) ||
          it.rider_name?.toLowerCase().includes(k) ||
          it.trigger_reason?.toLowerCase().includes(k)
        );
      }
      return true;
    });
  }, [items, filterStatus, keyword]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'PENDING', blocking: false });
    setDrawerOpen(true);
  };

  const openEdit = (record: ReInspectionTask) => {
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
      const payload: Partial<ReInspectionTask> = {
        ...values,
        scheduled_at: (values.scheduled_at as Dayjs | undefined)?.toISOString(),
        completed_at: (values.completed_at as Dayjs | undefined)?.toISOString(),
      };
      if (editing) {
        await api.updateReInspection(editing.id, payload);
        message.success('复勘任务已更新');
      } else {
        await api.createReInspection(payload);
        message.success('复勘任务已创建');
      }
      setDrawerOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验未通过
      message.error(`保存失败：${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteReInspection(id);
      message.success('已删除');
      fetchData();
    } catch (err: any) {
      message.error(`删除失败：${err.message}`);
    }
  };

  return (
    <Card
      title="复勘管理"
      bordered={false}
      extra={
        <Space>
          <AntInput.Search
            allowClear
            placeholder="报案号 / 骑手 / 复勘员"
            style={{ width: 220 }}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={setKeyword}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 140 }}
            value={filterStatus || undefined}
            onChange={(v) => setFilterStatus((v || '') as ReInspectionStatus | '')}
            options={STATUS_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建复勘</Button>
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
          { title: '骑手', dataIndex: 'rider_name', width: 110 },
          { title: '触发原因', dataIndex: 'trigger_reason', ellipsis: true },
          { title: '复勘员', dataIndex: 'inspector', width: 110 },
          {
            title: '计划时间',
            dataIndex: 'scheduled_at',
            width: 160,
            render: (v?: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (v: ReInspectionStatus) => {
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
                <Popconfirm title="确认删除该复勘任务？" onConfirm={() => handleDelete(record.id)}>
                  <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Drawer
        title={editing ? '编辑复勘任务' : '新建复勘任务'}
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
          <Form.Item label="触发原因" name="trigger_reason" rules={[{ required: true, message: '请输入触发原因' }]}>
            <Input placeholder="如：伤情加重 / 出险地点存疑 / 客户补充举证" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="复勘员" name="inspector" rules={[{ required: true, message: '请输入复勘员' }]}>
                <Input placeholder="如：人伤查勘-小李" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="复勘地点" name="location">
                <Input placeholder="可选" />
              </Form.Item>
            </Col>
          </Row>
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
          <Form.Item label="复勘结论" name="conclusion">
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
        title="复勘任务详情"
        width={520}
        open={!!viewing}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <DescriptionsLite record={viewing} />
        )}
      </Drawer>
    </Card>
  );
}

function DescriptionsLite({ record }: { record: ReInspectionTask }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['报案号', record.case_no],
    ['骑手', record.rider_name || '—'],
    ['触发原因', record.trigger_reason],
    ['复勘员', record.inspector],
    ['复勘地点', record.location || '—'],
    ['计划时间', record.scheduled_at ? dayjs(record.scheduled_at).format('YYYY-MM-DD HH:mm') : '—'],
    ['完成时间', record.completed_at ? dayjs(record.completed_at).format('YYYY-MM-DD HH:mm') : '—'],
    [
      '状态',
      <Tag color={STATUS_MAP[record.status]?.color}>{STATUS_MAP[record.status]?.label || record.status}</Tag>,
    ],
    ['是否阻塞结案', record.blocking ? <Tag color="red">是</Tag> : <Tag>否</Tag>],
    ['复勘结论', record.conclusion || '—'],
    ['备注', record.remark || '—'],
    ['创建时间', dayjs(record.created_at).format('YYYY-MM-DD HH:mm')],
    ['更新时间', dayjs(record.updated_at).format('YYYY-MM-DD HH:mm')],
  ];
  return (
    <div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ color: '#999', fontSize: 12 }}>{label}</div>
          <div style={{ fontSize: 14, marginTop: 2 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}
