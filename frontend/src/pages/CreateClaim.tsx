
import React, { useEffect, useState } from 'react';
import {
  Card, Form, Input, Select, Button, Row, Col, message, DatePicker, Switch, Space,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { VEHICLE_TYPE_OPTIONS } from '../utils/constants';
import { api, type RegionNode } from '../utils/api';

export default function CreateClaim() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  // 行政区三级联动字典
  const [regionOptions, setRegionOptions] = useState<RegionNode[]>([]);
  // 用户在三级下拉里分别选了哪几个
  const [province, setProvince] = useState<RegionNode | null>(null);
  const [city, setCity] = useState<RegionNode | null>(null);
  const [district, setDistrict] = useState<RegionNode | null>(null);

  // 加载省/市/区字典
  useEffect(() => {
    api.getRegions()
      .then((data) => setRegionOptions(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('[REGION] 加载行政区字典失败：', err?.message || err));
  }, []);

  // 同步侧边栏宽度到 CSS 变量（粘性按钮区 left 偏移使用）
  useEffect(() => {
    const sync = () => {
      const el = document.querySelector<HTMLElement>('[data-sider-width]');
      const w = el?.getAttribute('data-sider-width') || '220';
      document.documentElement.style.setProperty('--sider-w', `${w}px`);
    };
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['data-sider-width'] });
    return () => obs.disconnect();
  }, []);

  const onFinish = async (values: any) => {
    try {
      if (!province || !city || !district) {
        message.warning('请选择完整的省 / 市 / 区');
        return;
      }
      // 三级地址来自本地 state（province/city/district），不放在 form 字段里
      const regionText = [province.label, city.label, district.label].join(' / ');
      const detailText = (values.accident_detail || '').trim();
      const fullLocation = [regionText, detailText].filter(Boolean).join(' ');
      // 过滤掉已经单独存的字段，避免污染接口 payload
      const { accident_detail, ...rest } = values;
      await api.createClaim({
        ...rest,
        accident_location: fullLocation,
        // 同时把三段拆开存进去，方便后续做结构化筛选
        accident_region: regionText,
        accident_address_detail: detailText,
        accident_time: values.accident_time?.format?.('YYYY-MM-DD HH:mm:ss') || values.accident_time,
        vehicle_label: VEHICLE_TYPE_OPTIONS.find((item) => item.value === values.vehicle_type)?.label,
        company: '演示公司',
        rider_type: '专送',
      });
      message.success('报案成功！当前为待分流主单，请由客服在接件页执行分流');
      navigate('/cases');
    } catch (err: any) {
      message.error(`报案失败：${err.message}`);
    }
  };

  return (
    <Card title="报案工作台" bordered={false} className="task-detail-dense">
      <style>{`
        .task-detail-dense .field-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
          line-height: 1.25;
        }
        .task-detail-dense .ant-form-item { margin-bottom: 12px; }
        /* 粘性案件功能按钮区：固定贴底，跨越侧边栏宽度 */
        .intake-action-bar {
          position: fixed;
          left: var(--sider-w, 220px);
          right: 0;
          bottom: 0;
          z-index: 50;
          background: #fff;
          border-top: 1px solid #f0f0f0;
          box-shadow: 0 -2px 8px rgba(0,21,41,.06);
          padding: 10px 24px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
        }
        /* 避免最后一行被粘性按钮区遮挡 */
        .intake-action-spacer { height: 64px; }
      `}</style>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        {/* 基本信息 */}
        <Row gutter={[12, 0]}>
          <Col xs={24} md={6}>
            <div className="field-label">报案人姓名 *</div>
            <Form.Item name="reporter_name" rules={[{ required: true, message: '请输入报案人姓名' }]} noStyle>
              <Input placeholder="请输入" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">报案人电话 *</div>
            <Form.Item name="reporter_phone" rules={[{ required: true, message: '请输入联系电话' }]} noStyle>
              <Input placeholder="请输入" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">出险时间 *</div>
            <Form.Item name="accident_time" rules={[{ required: true, message: '请选择出险时间' }]} noStyle>
              <DatePicker showTime style={{ width: '100%' }} placeholder="请选择" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">事故类型 *</div>
            <Form.Item name="accident_type" rules={[{ required: true }]} noStyle>
              <Select
                placeholder="请选择"
                options={[
                  { value: 'CRASH', label: '碰撞事故' },
                  { value: 'FALL', label: '摔伤事故' },
                  { value: 'FIRE', label: '火灾事故' },
                  { value: 'OTHER', label: '其他' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[12, 0]}>
          <Col xs={24} md={5}>
            <div className="field-label">省 *</div>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="选择省/直辖市"
              style={{ width: '100%' }}
              value={province?.value}
              onChange={(v) => {
                const p = regionOptions.find((x) => x.value === v) || null;
                setProvince(p);
                setCity(null);
                setDistrict(null);
              }}
              options={regionOptions.map((p) => ({ value: p.value, label: p.label }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <div className="field-label">市 *</div>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={province ? '选择市' : '请先选省'}
              style={{ width: '100%' }}
              value={city?.value}
              disabled={!province}
              onChange={(v) => {
                const c = province?.children?.find((x) => x.value === v) || null;
                setCity(c);
                setDistrict(null);
              }}
              options={(province?.children || []).map((c) => ({ value: c.value, label: c.label }))}
            />
          </Col>
          <Col xs={24} md={5}>
            <div className="field-label">区/县 *</div>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={city ? '选择区/县' : '请先选市'}
              style={{ width: '100%' }}
              value={district?.value}
              disabled={!city}
              onChange={(v) => {
                const d = city?.children?.find((x) => x.value === v) || null;
                setDistrict(d);
              }}
              options={(city?.children || []).map((d) => ({ value: d.value, label: d.label }))}
            />
          </Col>
          <Col xs={24} md={9}>
            <div className="field-label">详细地址</div>
            <Form.Item
              name="accident_detail"
              rules={[{ max: 200, message: '详细地址不超过 200 字' }]}
              noStyle
            >
              <Input placeholder="街道、门牌号、标志性建筑等" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[12, 0]} style={{ marginTop: 4 }}>
          <Col xs={24} md={5}>
            <div className="field-label">我方责任比例 (%)</div>
            <Form.Item name="liability_ratio" initialValue={100} noStyle>
              <Input type="number" min={0} max={100} suffix="%" />
            </Form.Item>
          </Col>
        </Row>

        {/* 骑手 & 车辆信息 */}
        <Row gutter={[12, 0]} style={{ marginTop: 8 }}>
          <Col xs={24} md={4}>
            <div className="field-label">骑手姓名 *</div>
            <Form.Item name="rider_name" rules={[{ required: true, message: '请输入骑手姓名' }]} noStyle>
              <Input placeholder="被保险人姓名" />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <div className="field-label">骑手工号/平台ID</div>
            <Form.Item name="rider_id" noStyle>
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <div className="field-label">出险运单号</div>
            <Form.Item name="order_id" noStyle>
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <div className="field-label">标的车类型 *</div>
            <Form.Item name="vehicle_type" rules={[{ required: true, message: '请选择车辆类型' }]} noStyle>
              <Select placeholder="请选择" options={VEHICLE_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <div className="field-label">车牌/车架号</div>
            <Form.Item name="vehicle_plate" noStyle>
              <Input placeholder="可选" />
            </Form.Item>
          </Col>
          <Col xs={24} md={4}>
            <div className="field-label">险种架构 *</div>
            <Form.Item name="product" rules={[{ required: true, message: '请选择险种' }]} noStyle>
              <Select
                placeholder="请选择"
                options={[
                  { value: 'EMPLOYER', label: '雇主责任险' },
                  { value: 'GROUP_ACCIDENT', label: '团体意外险' },
                  { value: 'MOTOR_COMP', label: '摩托车综合险' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* 建议分流项 — 车损/物损拆成两个独立任务流 */}
        <Row gutter={[12, 0]} style={{ marginTop: 8 }}>
          <Col xs={24} md={6}>
            <div className="field-label">是否包含骑手人伤</div>
            <Form.Item name="has_rider_injury" valuePropName="checked" initialValue={true} noStyle>
              <Switch checkedChildren="含骑手人伤" unCheckedChildren="不含" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">是否包含三者人伤</div>
            <Form.Item name="has_third_injury" valuePropName="checked" initialValue={false} noStyle>
              <Switch checkedChildren="含三者人伤" unCheckedChildren="不含" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">是否包含三者车损</div>
            <Form.Item name="has_vehicle_loss" valuePropName="checked" initialValue={false} noStyle>
              <Switch checkedChildren="含三者车损" unCheckedChildren="不含" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">是否包含三者物损</div>
            <Form.Item name="has_property_loss" valuePropName="checked" initialValue={false} noStyle>
              <Switch checkedChildren="含三者物损" unCheckedChildren="不含" />
            </Form.Item>
          </Col>
        </Row>

        {/* 案情简述 */}
        <Row gutter={[12, 0]} style={{ marginTop: 8 }}>
          <Col span={24}>
            <div className="field-label">事故简述 *</div>
            <Form.Item name="accident_desc" rules={[{ required: true, message: '请填写事故简述' }]} noStyle>
              <Input.TextArea rows={2} placeholder="请简述事故经过、伤情、损失情况等" />
            </Form.Item>
          </Col>
        </Row>

        {/* 底部占位避免粘性按钮区遮挡 */}
        <div className="intake-action-spacer" />
      </Form>

      {/* 粘性案件功能按钮区（贴屏幕底部） */}
      <div className="intake-action-bar">
        <Button size="large" onClick={() => form.resetFields()}>重置</Button>
        <Button size="large" onClick={() => navigate('/dashboard')}>返回工作台</Button>
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          style={{ width: 200 }}
          onClick={() => form.submit()}
        >
          提交报案
        </Button>
      </div>
    </Card>
  );
}
