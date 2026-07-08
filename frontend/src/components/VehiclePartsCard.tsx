/**
 * VehiclePartsCard — 物损车辆维修费卡片
 *
 * 改造后结构：
 *   1) VIN 查询 + 车型识别（主页）
 *   2) "选择配件"按钮 → 弹窗（配件分类 + 配件库表格）
 *   3) 维修配件工单（主页）
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Checkbox, Col, Empty, Image, Input, List, message,
  Modal, Row, Space, Table, Tag, Tooltip, Typography, InputNumber,
} from 'antd';
import {
  CarOutlined, SearchOutlined, PictureOutlined, ReloadOutlined,
  DeleteOutlined, SaveOutlined, PlusOutlined,
} from '@ant-design/icons';
import {
  api,
  type VehicleModel, type VehiclePart, type VehiclePartCategory,
  type RepairOrder, type RepairOrderItem,
} from '../utils/api';

const { Text, Title } = Typography;

interface Props {
  caseId: string;
  taskId?: string;
  canEdit: boolean;
  onTotalChange?: (totalMarket: number) => void;
}

const SAMPLE_VIN = 'LGBH12E20HY420076';

const VehiclePartsCard: React.FC<Props> = ({ caseId, taskId, canEdit, onTotalChange }) => {
  const [vinInput, setVinInput] = useState('');
  const [vehicle, setVehicle] = useState<VehicleModel | null>(null);
  const [vehicleLoading, setVehicleLoading] = useState(false);

  const [categories, setCategories] = useState<VehiclePartCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [partKeyword, setPartKeyword] = useState('');
  const [parts, setParts] = useState<VehiclePart[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

  const [order, setOrder] = useState<RepairOrder | null>(null);
  const [orderItems, setOrderItems] = useState<RepairOrderItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  // 加载工单
  useEffect(() => {
    if (!caseId) return;
    api.getRepairOrder(caseId)
      .then((data) => {
        setOrder(data);
        setOrderItems(data?.items || []);
        if (data?.vehicle_model_id) {
          api.searchVehicleByVin(data.vin).then((res) => {
            if (res.model) {
              setVehicle(res.model);
              setVinInput(res.model.vin);
              setCategories(res.model.categories);
              if (!activeCategory && res.model.categories[0]) {
                setActiveCategory(res.model.categories[0].key);
              }
            }
          });
        }
        setOrderLoaded(true);
      })
      .catch((err) => {
        console.warn('加载工单失败:', err);
        setOrderLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  // 加载配件
  useEffect(() => {
    if (!vehicle || !activeCategory) return;
    setPartsLoading(true);
    api.searchVehicleParts({
      vehicleModelId: vehicle.id,
      category: activeCategory,
      keyword: partKeyword,
    }).then((res) => {
      setParts(res.items);
    }).catch((err) => {
      message.error(`配件查询失败：${err.message}`);
      setParts([]);
    }).finally(() => setPartsLoading(false));
  }, [vehicle, activeCategory, partKeyword]);

  const handleVinSearch = async () => {
    if (!vinInput.trim()) {
      message.warning('请输入 VIN 码');
      return;
    }
    setVehicleLoading(true);
    try {
      const res = await api.searchVehicleByVin(vinInput.trim());
      if (!res.model) {
        message.warning('未匹配到车型，请检查 VIN 或手动选择');
        setVehicle(null);
        return;
      }
      setVehicle(res.model);
      setCategories(res.model.categories);
      setActiveCategory(res.model.categories[0]?.key || '');
      setParts([]);
    } catch (err: any) {
      message.error(`VIN 查询失败：${err.message}`);
    } finally {
      setVehicleLoading(false);
    }
  };

  const loadSampleVin = () => {
    setVinInput(SAMPLE_VIN);
  };

  const togglePart = (part: VehiclePart, checked: boolean) => {
    setOrderItems((prev) => {
      if (checked) {
        if (prev.some((it) => it.part_id === part.id)) return prev;
        const item: RepairOrderItem = {
          id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          part_id: part.id,
          oem_code: part.oem_code,
          name: part.name,
          original_name: part.original_name,
          category: part.category,
          price_msrp: part.price_msrp,
          price_market: part.price_market,
          quantity: 1,
          subtotal_msrp: part.price_msrp,
          subtotal_market: part.price_market,
        };
        return [...prev, item];
      }
      return prev.filter((it) => it.part_id !== part.id);
    });
  };

  const isPartSelected = (partId: string) =>
    orderItems.some((it) => it.part_id === partId);

  const updateQuantity = (id: string, quantity: number) => {
    setOrderItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const q = Math.max(1, Math.floor(quantity || 0));
      return {
        ...it,
        quantity: q,
        subtotal_msrp: it.price_msrp * q,
        subtotal_market: it.price_market * q,
      };
    }));
  };

  const removeItem = (id: string) => {
    setOrderItems((prev) => prev.filter((it) => it.id !== id));
  };

  const totalMsrp = useMemo(
    () => orderItems.reduce((s, it) => s + it.subtotal_msrp, 0),
    [orderItems],
  );
  const totalMarket = useMemo(
    () => orderItems.reduce((s, it) => s + it.subtotal_market, 0),
    [orderItems],
  );

  useEffect(() => {
    if (!onTotalChange) return;
    onTotalChange(totalMarket);
  }, [totalMarket, onTotalChange]);

  const handleSaveOrder = async () => {
    if (!vehicle) {
      message.warning('请先查询并确认车型');
      return;
    }
    if (orderItems.length === 0) {
      message.warning('请至少勾选一个配件');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.saveRepairOrder(caseId, {
        task_id: taskId,
        vehicle_model_id: vehicle.id,
        vin: vehicle.vin,
        brand: vehicle.brand,
        series: vehicle.series,
        trim: vehicle.trim,
        items: orderItems,
        total_msrp: totalMsrp,
        total_market: totalMarket,
      });
      setOrder(saved);
      message.success('维修工单已保存');
    } catch (err: any) {
      message.error(`保存工单失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClearOrder = async () => {
    if (!order) {
      setOrderItems([]);
      return;
    }
    try {
      await api.deleteRepairOrder(caseId);
      setOrder(null);
      setOrderItems([]);
      message.success('工单已清空');
    } catch (err: any) {
      message.error(`清空工单失败：${err.message}`);
    }
  };

  const vehicleSummary = vehicle ? (
    <Row gutter={[12, 8]} style={{ marginTop: 4 }}>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>VIN年份</Text><div>{vehicle.year}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>一级分类</Text><div>{vehicle.category_l1}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>二级分类</Text><div>{vehicle.category_l2}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>厂商类型</Text><div>{vehicle.manufacturer}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>国别</Text><div>{vehicle.origin}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>变速箱</Text><div>{vehicle.transmission}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>排量</Text><div>{vehicle.displacement}</div></Col>
      <Col xs={12} md={6}><Text type="secondary" style={{ fontSize: 12 }}>驱动形式</Text><div>{vehicle.drive_form}</div></Col>
    </Row>
  ) : null;

  const orderColumns = [
    { title: '零件号', dataIndex: 'oem_code', width: 170 },
    { title: '零件名称', dataIndex: 'name', width: 180 },
    { title: '原厂零件名称', dataIndex: 'original_name', width: 200 },
    {
      title: '厂商指导价', dataIndex: 'price_msrp', width: 130,
      render: (v: number) => <span style={{ color: '#999' }}>¥{v.toFixed(2)}</span>,
    },
    {
      title: '市场价', dataIndex: 'price_market', width: 120,
      render: (v: number) => <span style={{ color: '#cf1322', fontWeight: 600 }}>¥{v.toFixed(2)}</span>,
    },
    {
      title: '数量', dataIndex: 'quantity', width: 90,
      render: (v: number, r: RepairOrderItem) => (
        <InputNumber
          size="small" min={1} value={v}
          disabled={!canEdit}
          onChange={(val) => updateQuantity(r.id, Number(val) || 1)}
        />
      ),
    },
    {
      title: '小计（市场）', dataIndex: 'subtotal_market', width: 130,
      render: (v: number) => <Text strong style={{ color: '#cf1322' }}>¥{v.toFixed(2)}</Text>,
    },
    {
      title: '操作', width: 70, fixed: 'right' as const,
      render: (_: any, r: RepairOrderItem) => (
        canEdit ? (
          <Button type="link" danger size="small" icon={<DeleteOutlined />}
            onClick={() => removeItem(r.id)}
          >删除</Button>
        ) : null
      ),
    },
  ];

  return (
    <Card
      size="small"
      bordered
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <CarOutlined style={{ color: '#1677ff' }} />
          <span>车辆维修费</span>
        </Space>
      }
    >
      {/* VIN 查询 + 选择配件 + 清空工单 同行 */}
      <Row gutter={12} align="middle" style={{ marginBottom: 12 }}>
        <Col flex="auto">
          <Input
            size="middle"
            placeholder="请输入 VIN 码（17 位）"
            value={vinInput}
            onChange={(e) => setVinInput(e.target.value)}
            onPressEnter={canEdit ? handleVinSearch : undefined}
            disabled={!canEdit}
            allowClear
          />
        </Col>
        <Col>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} loading={vehicleLoading}
              disabled={!canEdit} onClick={handleVinSearch}>查询车型</Button>
            {canEdit && (
              <Tooltip title="填入演示 VIN">
                <Button icon={<ReloadOutlined />} onClick={loadSampleVin}>示例VIN</Button>
              </Tooltip>
            )}
            {canEdit && vehicle && (
              <Button size="middle" icon={<PlusOutlined />} onClick={() => setPartPickerOpen(true)}>
                选择配件
              </Button>
            )}
            {canEdit && orderItems.length > 0 && (
              <Button size="middle" danger onClick={handleClearOrder}>清空工单</Button>
            )}
          </Space>
        </Col>
      </Row>

      {/* 车型识别结果 */}
      {vehicle ? (
        <Card size="small" style={{ marginBottom: 12, background: '#fafafa' }} bordered>
          <Space>
            <Title level={5} style={{ margin: 0 }}>
              {vehicle.brand}-{vehicle.series}
            </Title>
            <Tag color="cyan">{vehicle.trim}</Tag>
            <Tag color="gold">厂商指导价 ¥{vehicle.msrp_total.toLocaleString()}</Tag>
          </Space>
          {vehicleSummary}
        </Card>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="尚未识别车型，请先输入 VIN 查询"
          style={{ marginBottom: 12 }}
        />
      )}

      {/* 维修配件工单 */}
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={orderItems}
        columns={orderColumns}
        locale={{ emptyText: orderLoaded ? '点击右上角「选择配件」按钮添加维修配件' : '加载中...' }}
        scroll={{ x: 900 }}
        summary={() =>
          orderItems.length > 0 ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={6} align="right">
                  <Text strong>合计</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1}>
                  <Text strong style={{ color: '#cf1322' }}>¥{totalMarket.toFixed(2)}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />

      {/* 配件选择弹窗 */}
      <Modal
        open={partPickerOpen}
        onCancel={() => setPartPickerOpen(false)}
        footer={null}
        width="min(1320px, 96vw)"
        styles={{ body: { height: '68vh', overflow: 'auto' } }}
        title={
          <Space>
            <PictureOutlined />
            <span>配件库 — 选择维修配件</span>
            {vehicle && <Tag color="blue">{vehicle.brand} {vehicle.series}</Tag>}
          </Space>
        }
      >
        <Row gutter={12}>
          <Col xs={24} md={6}>
            <Card size="small" title="配件分类" bordered styles={{ body: { padding: 0, maxHeight: 360, overflow: 'auto' } }}>
              <List
                size="small"
                dataSource={categories}
                locale={{ emptyText: '该车型暂无配件分类' }}
                renderItem={(cat) => {
                  const isActive = cat.key === activeCategory;
                  return (
                    <List.Item
                      style={{
                        cursor: canEdit ? 'pointer' : 'default',
                        background: isActive ? '#e6f7ff' : 'transparent',
                        borderLeft: isActive ? '3px solid #1677ff' : '3px solid transparent',
                        padding: '8px 12px',
                      }}
                      onClick={() => canEdit && setActiveCategory(cat.key)}
                    >
                      <Text style={{ color: isActive ? '#1677ff' : undefined, fontWeight: isActive ? 500 : 400 }}>
                        {cat.name}
                      </Text>
                    </List.Item>
                  );
                }}
              />
            </Card>
          </Col>
          <Col xs={24} md={18}>
            <Card size="small" bordered
              title={
                <Space>
                  <span>配件列表</span>
                  <Input.Search
                    size="small"
                    placeholder="请输入零件名称/OEM码"
                    allowClear
                    style={{ width: 240 }}
                    onSearch={setPartKeyword}
                    disabled={!canEdit}
                  />
                </Space>
              }
            >
              <Table
                size="small"
                rowKey="id"
                loading={partsLoading}
                pagination={false}
                dataSource={parts}
                locale={{ emptyText: '该分类下暂无配件' }}
                scroll={{ x: 720, y: 380 }}
                columns={[
                  {
                    title: '选择', dataIndex: 'id', width: 60,
                    render: (_: any, r: VehiclePart) => (
                      <Checkbox
                        checked={isPartSelected(r.id)}
                        disabled={!canEdit}
                        onChange={(e) => togglePart(r, e.target.checked)}
                      />
                    ),
                  },
                  { title: '零件名称', dataIndex: 'name', width: 180 },
                  { title: '原厂零件名称', dataIndex: 'original_name', width: 200 },
                  { title: '零件号', dataIndex: 'oem_code', width: 170 },
                  {
                    title: '市场价', dataIndex: 'price_market', width: 120,
                    render: (v: number) => <Text style={{ color: '#cf1322', fontWeight: 600 }}>¥{v.toFixed(2)}</Text>,
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

export default VehiclePartsCard;
