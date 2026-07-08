/**
 * LaborFeeCard — 物损车辆工时费卡片
 *
 * 改造后结构：
 *   主页：工时工单信息卡 + 右上角"录入工时费"按钮
 *   弹窗：工时大类选择 + 工时项目列表（勾选后关闭弹窗即生效）
 */
import React, { useMemo, useState } from 'react';
import {
  Button, Card, Checkbox, Col, Empty, Input, InputNumber, List,
  Modal, Row, Space, Table, Tag, Typography,
} from 'antd';
import {
  ToolOutlined, DeleteOutlined, PlusOutlined,
} from '@ant-design/icons';
import { LABOR_CATALOG, LABOR_CATEGORIES, type LaborCatalogItem } from '../utils/constants';

const { Text } = Typography;

export interface LaborOrderItem {
  id: string;
  catalog_id: string;
  category: string;
  name: string;
  reference_price: number;
  labor_fee: number;
  reviewed_price?: number;
}

interface Props {
  canEdit: boolean;
  items: LaborOrderItem[];
  onChange: (items: LaborOrderItem[]) => void;
}

const LaborFeeCard: React.FC<Props> = ({ canEdit, items, onChange }) => {
  const [activeCategory, setActiveCategory] = useState<string>(LABOR_CATEGORIES[0] || '');
  const [keyword, setKeyword] = useState('');
  const [laborPickerOpen, setLaborPickerOpen] = useState(false);

  // 当前分类下过滤后的工时项目
  const filteredCatalog = useMemo(() => {
    let list = LABOR_CATALOG;
    if (activeCategory) list = list.filter((i) => i.category === activeCategory);
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(k) || i.category.toLowerCase().includes(k));
    }
    return list;
  }, [activeCategory, keyword]);

  // 已选 id set（快速查找）
  const selectedIds = useMemo(() => new Set(items.map((it) => it.catalog_id)), [items]);

  const toggleItem = (catalog: LaborCatalogItem, checked: boolean) => {
    if (checked) {
      if (selectedIds.has(catalog.id)) return;
      const newItem: LaborOrderItem = {
        id: `labor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        catalog_id: catalog.id,
        category: catalog.category,
        name: catalog.name,
        reference_price: catalog.reference_price,
        labor_fee: catalog.reference_price,
      };
      onChange([...items, newItem]);
    } else {
      onChange(items.filter((it) => it.catalog_id !== catalog.id));
    }
  };

  const updateLaborFee = (id: string, fee: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, labor_fee: fee } : it)));
  };

  const updateReviewedPrice = (id: string, price: number) => {
    onChange(items.map((it) => (it.id === id ? { ...it, reviewed_price: price } : it)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((it) => it.id !== id));
  };

  // 合计
  const totalFee = useMemo(() => items.reduce((s, it) => s + it.labor_fee, 0), [items]);

  // 工单列定义
  const orderColumns = [
    { title: '工时大类', dataIndex: 'category', width: 100 },
    { title: '工时项目', dataIndex: 'name', width: 180 },
    {
      title: '工时参考价', dataIndex: 'reference_price', width: 120,
      render: (v: number) => <span style={{ color: '#999' }}>¥{v.toFixed(2)}</span>,
    },
    {
      title: '工时费', dataIndex: 'labor_fee', width: 140,
      render: (v: number, r: LaborOrderItem) => (
        <InputNumber
          size="small"
          min={0}
          precision={2}
          value={v}
          disabled={!canEdit}
          onChange={(val) => updateLaborFee(r.id, Number(val) || 0)}
          style={{ width: '100%' }}
          addonAfter="元"
        />
      ),
    },
    {
      title: '操作', width: 70, fixed: 'right' as const,
      render: (_: any, r: LaborOrderItem) =>
        canEdit ? (
          <Button type="link" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(r.id)}>
            删除
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      size="small"
      bordered
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <ToolOutlined style={{ color: '#faad14' }} />
          <span>工时工单信息卡</span>
          <Tag color="orange">合计 ¥{totalFee.toFixed(2)}</Tag>
          {items.length > 0 && <Tag color="blue">{items.length} 项</Tag>}
        </Space>
      }
      extra={
        canEdit ? (
          <Button size="small" icon={<PlusOutlined />} type="primary" onClick={() => setLaborPickerOpen(true)}>
            录入工时费
          </Button>
        ) : null
      }
    >
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={items}
        columns={orderColumns}
        locale={{ emptyText: '点击右上角「录入工时费」按钮添加工时项目' }}
        scroll={{ x: 800 }}
        summary={() =>
          items.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2} align="right">
                  <Text strong>合计</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text strong style={{ color: '#faad14', fontSize: 14 }}>¥{totalFee.toFixed(2)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />

      {/* 工时项目选择弹窗 */}
      <Modal
        open={laborPickerOpen}
        onCancel={() => setLaborPickerOpen(false)}
        footer={null}
        width="min(1320px, 96vw)"
        styles={{ body: { height: '68vh', overflow: 'auto' } }}
        title={
          <Space>
            <ToolOutlined />
            <span>工时项目库 — 选择工时</span>
          </Space>
        }
      >
        <Row gutter={12}>
          <Col xs={24} md={5}>
            <Card size="small" title="工时大类" bordered styles={{ body: { padding: 0, maxHeight: 360, overflow: 'auto' } }}>
              <List
                size="small"
                dataSource={LABOR_CATEGORIES}
                renderItem={(cat) => {
                  const isActive = cat === activeCategory;
                  const count = items.filter((it) => it.category === cat).length;
                  return (
                    <List.Item
                      style={{
                        cursor: canEdit ? 'pointer' : 'default',
                        background: isActive ? '#fff7e6' : 'transparent',
                        borderLeft: isActive ? '3px solid #faad14' : '3px solid transparent',
                        padding: '8px 12px',
                      }}
                      onClick={() => canEdit && setActiveCategory(cat)}
                    >
                      <Text style={{ color: isActive ? '#faad14' : undefined, fontWeight: isActive ? 500 : 400 }}>
                        {cat}
                        {count > 0 && <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>{count}</Tag>}
                      </Text>
                    </List.Item>
                  );
                }}
              />
            </Card>
          </Col>
          <Col xs={24} md={19}>
            <Card size="small" bordered
              title={
                <Space>
                  <span>工时项目列表</span>
                  <Input.Search
                    size="small"
                    placeholder="搜索工时项目"
                    allowClear
                    style={{ width: 200 }}
                    onSearch={setKeyword}
                    disabled={!canEdit}
                  />
                </Space>
              }
            >
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={filteredCatalog}
                locale={{ emptyText: '该分类下暂无工时项目' }}
                scroll={{ x: 500, y: 380 }}
                columns={[
                  {
                    title: '选择', dataIndex: 'id', width: 60,
                    render: (_: any, r: LaborCatalogItem) => (
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        disabled={!canEdit}
                        onChange={(e) => toggleItem(r, e.target.checked)}
                      />
                    ),
                  },
                  { title: '工时大类', dataIndex: 'category', width: 100 },
                  { title: '工时项目', dataIndex: 'name', width: 200 },
                  {
                    title: '工时参考价', dataIndex: 'reference_price', width: 130,
                    render: (v: number) => <Text strong style={{ color: '#faad14' }}>¥{v.toFixed(2)}</Text>,
                  },
                ]}
              />
            </Card>
          </Col>
        </Row>
      </Modal>
    </Card>
  );
};

export default LaborFeeCard;
