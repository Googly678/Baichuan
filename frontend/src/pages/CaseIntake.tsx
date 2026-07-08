/**
 * CaseIntake — 客服专员专属页
 *
 * 负责创建报案主单：填写报案基本信息 → 提交后由客服专员在【案件详情】页执行分流。
 * 接件记录查询与"执行分流"功能已统一到工作台（待分流报案池）和案件详情页。
 */
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Card, Form, Input, Select, Button, Row, Col, message,
  DatePicker, Space, Result, Cascader,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { RoleContext } from '../App';
import { VEHICLE_TYPE_OPTIONS } from '../utils/constants';
import { api, type RegionNode } from '../utils/api';

const DRAFT_STORAGE_KEY = 'case_intake_draft';
const DRAFT_AUTO_SAVE_INTERVAL = 5000; // 5 seconds

export default function CaseIntake() {
  const navigate = useNavigate();
  const { role } = useContext(RoleContext);
  const [form] = Form.useForm();
  const draftSaveTimerRef = useRef<ReturnType<typeof setInterval>>();
  const lastFormValuesRef = useRef<any>();
  // 行政区三级联动（省/市/区）
  const [regionOptions, setRegionOptions] = useState<RegionNode[]>([]);

  // 恢复表单草稿
  useEffect(() => {
    try {
      const draft = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (draft) {
        const draftData = JSON.parse(draft);
        console.log('[DRAFT] 已恢复表单草稿');
        form.setFieldsValue(draftData);
      }
    } catch (err) {
      console.error('[DRAFT] 恢复表单草稿失败:', err);
    }
  }, [form]);

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

  // 定期自动保存表单草稿
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const currentValues = form.getFieldsValue();
        const serializable: any = {};
        for (const [key, value] of Object.entries(currentValues)) {
          if (!value) {
            serializable[key] = value;
          } else if (typeof value === 'object' && '_isAMomentObject' in value) {
            serializable[key] = (value as any).format('YYYY-MM-DD HH:mm:ss');
          } else if (typeof value === 'object' && value.constructor.name === 'Dayjs') {
            serializable[key] = (value as any).format('YYYY-MM-DD HH:mm:ss');
          } else if (value instanceof Date) {
            serializable[key] = value.toISOString();
          } else {
            serializable[key] = value;
          }
        }

        const hasValues = Object.values(serializable).some(v => v);
        if (hasValues && JSON.stringify(serializable) !== JSON.stringify(lastFormValuesRef.current)) {
          localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializable));
          lastFormValuesRef.current = serializable;
          console.log('[DRAFT] 表单草稿已自动保存');
        }
      } catch (err) {
        console.warn('[DRAFT] 自动保存失败（非致命错误）:', err instanceof Error ? err.message : err);
      }
    }, DRAFT_AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [form]);

  if (role !== 'CUSTOMER_SERVICE') {
    return (
      <Card bordered={false}>
        <Result
          status="403"
          title="无权限"
          subTitle="该页面仅限【客服专员】角色访问，其他角色请通过工作台操作任务。"
          extra={<Button type="primary" onClick={() => navigate('/dashboard')}>返回工作台</Button>}
        />
      </Card>
    );
  }

  const onFinish = async (values: any) => {
    try {
      // 把「省/市/区」三联 + 「详细地址」拼成单一字符串写入 accident_location
      const regionLabels: string[] = Array.isArray(values.accident_region) ? values.accident_region : [];
      const regionText = regionLabels.join(' / ');
      const detailText = (values.accident_detail || '').trim();
      const fullLocation = [regionText, detailText].filter(Boolean).join(' ');
      const { accident_region, accident_detail, ...rest } = values;
      const created = await api.createClaim({
        ...rest,
        accident_location: fullLocation,
        // 同时把三段拆开存进去，方便后续做结构化筛选
        accident_region: regionText,
        accident_address_detail: detailText,
        accident_time: values.accident_time?.format?.('YYYY-MM-DD HH:mm:ss') || values.accident_time,
        vehicle_label: VEHICLE_TYPE_OPTIONS.find(o => o.value === values.vehicle_type)?.label || values.vehicle_type,
        company: '演示公司',
        rider_type: '专送',
        has_rider_injury: false,
        has_third_injury: false,
        has_property_loss: false,
      });
      message.success(`报案 ${created.data.case_no} 创建成功，当前状态为【待分流】`);
      // 清除草稿
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      lastFormValuesRef.current = undefined;
      form.resetFields();
      // 跳转到新创建的报案详情页，由客服专员在详情页执行分流
      navigate(`/cases/${created.data.id}`);
    } catch (err: any) {
      message.error(`创建报案失败：${err.message}`);
    }
  };

  return (
    <Card
      bordered={false}
      title="新建接件（报案主单）"
      className="task-detail-dense"
    >
      <style>{`
        .task-detail-dense .field-label {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 4px;
          line-height: 1.25;
        }
        .task-detail-dense .ant-form-item { margin-bottom: 12px; }
        /* 案件功能按钮区：固定贴底，跨越侧边栏宽度 */
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
        /* 给底部留出按钮区高度，避免最后一行被遮挡 */
        .intake-action-spacer { height: 64px; }
      `}</style>

      <Form form={form} layout="vertical" onFinish={onFinish}>
        {/* 基础报案信息 */}
        <Row gutter={[12, 0]}>
          <Col xs={24} md={6}>
            <div className="field-label">报案人姓名 *</div>
            <Form.Item name="reporter_name" rules={[{ required: true, message: '必填' }]} noStyle>
              <Input placeholder="请输入" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">报案人联系电话 *</div>
            <Form.Item name="reporter_phone" rules={[{ required: true, message: '必填' }]} noStyle>
              <Input placeholder="请输入" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">出险时间 *</div>
            <Form.Item name="accident_time" rules={[{ required: true, message: '必填' }]} noStyle>
              <DatePicker showTime style={{ width: '100%' }} placeholder="请选择" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <div className="field-label">事故类型 *</div>
            <Form.Item name="accident_type" rules={[{ required: true, message: '必填' }]} noStyle>
              <Select placeholder="请选择" options={[
                { value: 'CRASH', label: '碰撞事故' },
                { value: 'FALL',  label: '摔伤事故' },
                { value: 'FIRE',  label: '火灾事故' },
                { value: 'OTHER', label: '其他' },
              ]} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[12, 0]}>
          <Col xs={24} md={8}>
            <div className="field-label">出险地区 *</div>
            <Form.Item
              name="accident_region"
              rules={[{ required: true, message: '请选择省/市/区' }]}
              noStyle
            >
              <Cascader
                options={regionOptions}
                placeholder="省 / 市 / 区"
                changeOnSelect={false}
                expandTrigger="hover"
                showSearch={{ filter: (input, options) =>
                  (options?.label || '').toString().toLowerCase().includes(input.toLowerCase())
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={11}>
            <div className="field-label">详细地址</div>
            <Form.Item
              name="accident_detail"
              rules={[{ max: 200, message: '详细地址不超过 200 字' }]}
              noStyle
            >
              <Input placeholder="街道、门牌号、标志性建筑等" />
            </Form.Item>
          </Col>
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
            <Form.Item name="rider_name" rules={[{ required: true, message: '必填' }]} noStyle>
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
            <Form.Item name="vehicle_type" rules={[{ required: true, message: '必填' }]} noStyle>
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
            <div className="field-label">险种 *</div>
            <Form.Item name="product" rules={[{ required: true, message: '必填' }]} noStyle>
              <Select placeholder="请选择" options={[
                { value: 'EMPLOYER',       label: '雇主责任险' },
                { value: 'GROUP_ACCIDENT', label: '团体意外险' },
                { value: 'MOTOR_COMP',     label: '摩托车综合险' },
              ]} />
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

        <div className="intake-action-spacer" />
      </Form>

      {/* 粘性功能按钮区（贴屏幕底部） */}
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
