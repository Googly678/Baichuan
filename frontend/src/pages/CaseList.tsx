import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { TASK_STATUS_ORDER, TASK_TYPE_LABEL } from '../utils/constants';
import { api } from '../utils/api';
import type { ClaimCase } from '../types/claim';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const CASE_TYPE_OPTIONS = [
  { value: 'rider_injury', label: '骑手人伤' },
  { value: 'third_injury', label: '三者人伤' },
  { value: 'third_property', label: '三者物损' },
];

const OVERALL_STATUS_META: Record<string, { label: string; color: string }> = {
  待查勘: { label: '待查勘', color: 'warning' },
  部分立案: { label: '部分立案', color: 'gold' },
  已立案: { label: '已立案', color: 'blue' },
  协议中: { label: '协议中', color: 'processing' },
  部分结案: { label: '部分结案', color: 'purple' },
  已结案: { label: '已结案', color: 'success' },
};

const DIRECT_MUNICIPALITIES = ['北京市', '天津市', '上海市', '重庆市'];

function normalizeText(value: string) {
  return (value || '').replace(/\s+/g, '').trim();
}

function parseAccidentArea(rawLocation: string) {
  const text = normalizeText(rawLocation);
  let province = '';
  let city = '';
  let district = '';

  const matchDistrict = (input: string) => input.match(/^(.+?(?:区|县|旗))/)?.[1] || '';

  const directProvince = DIRECT_MUNICIPALITIES.find((item) => text.startsWith(item));
  if (directProvince) {
    province = directProvince;
    city = directProvince;
    district = matchDistrict(text.slice(directProvince.length));
    return { province, city, district };
  }

  const provinceMatch = text.match(/^(.+?(?:省|自治区|特别行政区))/);
  if (provinceMatch) {
    province = provinceMatch[1];
    const rest = text.slice(province.length);
    const cityMatch = rest.match(/^(.+?(?:市|自治州|地区|盟))/);
    if (cityMatch) {
      city = cityMatch[1];
      district = matchDistrict(rest.slice(city.length));
    } else {
      district = matchDistrict(rest);
    }
    return { province, city, district };
  }

  const cityMatch = text.match(/^(.+?市)/);
  if (cityMatch) {
    province = cityMatch[1];
    district = matchDistrict(text.slice(province.length));
  }

  return { province, city, district };
}

function getCaseTypeCodes(record: ClaimCase) {
  const fromTasks = Array.from(new Set(record.tasks.map((task) => task.task_type)));
  if (fromTasks.length) return fromTasks;

  const flags = record.task_details || {};
  const fallback: string[] = [];
  if (flags.has_rider_injury) fallback.push('rider_injury');
  if (flags.has_third_injury) fallback.push('third_injury');
  if (flags.has_property_loss) fallback.push('third_property');
  return fallback;
}

function getOverallStatus(record: ClaimCase) {
  const statuses = record.tasks.map((task) => task.status);
  if (!statuses.length || statuses.every((status) => status === 'PENDING_SPLIT' || status === 'PENDING')) {
    return '待查勘';
  }
  if (statuses.every((status) => status === 'DONE')) {
    return '已结案';
  }
  if (statuses.some((status) => status === 'DONE')) {
    return '部分结案';
  }

  const hasAgreementStage = statuses.some((status) => ['SUBMITTED_AGREEMENT', 'AGREEMENT_APPROVED', 'SUBMITTED_SURVEY', 'SURVEY_APPROVED'].includes(status));
  const hasRegStage = statuses.some((status) => ['SUBMITTED_REG', 'REG_APPROVED'].includes(status));
  const allAtLeastAgreement = statuses.every((status) => (TASK_STATUS_ORDER[status] ?? 0) >= TASK_STATUS_ORDER.SUBMITTED_AGREEMENT);
  const allAtLeastReg = statuses.every((status) => (TASK_STATUS_ORDER[status] ?? 0) >= TASK_STATUS_ORDER.REG_APPROVED);

  if (hasAgreementStage) {
    return allAtLeastAgreement ? '已立案' : '协议中';
  }
  if (hasRegStage) {
    return allAtLeastReg ? '已立案' : '部分立案';
  }
  return '待查勘';
}

function formatDateTime(value?: string) {
  if (!value) return '—';
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

export default function CaseList() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<ClaimCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<any>(null);
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [caseTypes, setCaseTypes] = useState<string[]>([]);

  useEffect(() => {
    api.getClaims()
      .then(setCases)
      .catch((err) => message.error(`获取案件列表失败：${err.message}`))
      .finally(() => setLoading(false));
  }, []);

  const areaIndex = useMemo(() => {
    const provinceMap = new Map<string, Map<string, Set<string>>>();

    cases.forEach((record) => {
      const parsed = parseAccidentArea(record.accident_location || '');
      if (!parsed.province) return;
      if (!provinceMap.has(parsed.province)) {
        provinceMap.set(parsed.province, new Map());
      }
      const cityMap = provinceMap.get(parsed.province)!;
      const cityKey = parsed.city || '';
      if (!cityMap.has(cityKey)) {
        cityMap.set(cityKey, new Set());
      }
      if (parsed.district) {
        cityMap.get(cityKey)!.add(parsed.district);
      }
    });

    const provinceOptions = Array.from(provinceMap.keys()).sort().map((item) => ({ value: item, label: item }));
    const cityOptions = province ? Array.from(provinceMap.get(province)?.keys() || [])
      .filter(Boolean)
      .sort()
      .map((item) => ({ value: item, label: item })) : [];
    const districtOptions = province && city
      ? Array.from(provinceMap.get(province)?.get(city) || []).sort().map((item) => ({ value: item, label: item }))
      : province && !city
        ? Array.from(provinceMap.get(province)?.get('') || []).sort().map((item) => ({ value: item, label: item }))
        : [];

    return {
      provinceOptions,
      cityOptions,
      districtOptions,
      provinceMap,
    };
  }, [cases, province, city]);

  const filteredCases = useMemo(() => {
    const [startDate, endDate] = dateRange || [];
    const startTime = startDate?.startOf?.('day')?.valueOf?.() ?? null;
    const endTime = endDate?.endOf?.('day')?.valueOf?.() ?? null;
    const trimmedKeyword = keyword.trim();

    return cases.filter((record) => {
      const parsedArea = parseAccidentArea(record.accident_location || '');
      const types = getCaseTypeCodes(record);
      const accidentTimeValue = Date.parse((record.accident_time || '').replace(/-/g, '/'));

      if (trimmedKeyword) {
        const keywordMatched = [record.case_no, record.company]
          .some((field) => (field || '').includes(trimmedKeyword));
        if (!keywordMatched) return false;
      }

      if (startTime !== null && !Number.isNaN(accidentTimeValue) && accidentTimeValue < startTime) {
        return false;
      }
      if (endTime !== null && !Number.isNaN(accidentTimeValue) && accidentTimeValue > endTime) {
        return false;
      }

      if (province && parsedArea.province !== province) {
        return false;
      }
      if (city && parsedArea.city !== city) {
        return false;
      }
      if (district && parsedArea.district !== district) {
        return false;
      }
      if (caseTypes.length && !types.some((type) => caseTypes.includes(type))) {
        return false;
      }

      return true;
    });
  }, [cases, keyword, dateRange, province, city, district, caseTypes]);

  const resetFilters = () => {
    setKeyword('');
    setDateRange(null);
    setProvince('');
    setCity('');
    setDistrict('');
    setCaseTypes([]);
  };

  const columns = [
    {
      title: '案件号',
      dataIndex: 'case_no',
      width: 170,
      sorter: (a: ClaimCase, b: ClaimCase) => (a.case_no || '').localeCompare(b.case_no || ''),
      defaultSortOrder: 'ascend' as const,
      render: (text: string) => <Text strong>{text}</Text>,
    },
    { title: '归属公司', dataIndex: 'company', width: 160, ellipsis: true },
    { title: '骑手姓名', dataIndex: 'rider_name', width: 120, ellipsis: true },
    { title: '标的车', dataIndex: 'vehicle_label', width: 180, ellipsis: true },
    {
      title: '车牌号',
      dataIndex: 'vehicle_plate',
      width: 140,
      render: (_: string, record: ClaimCase) => record.vehicle_plate || '—',
    },
    { title: '出险地点', dataIndex: 'accident_location', width: 220, ellipsis: true },
    {
      title: '出险时间',
      dataIndex: 'accident_time',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '整案状态',
      dataIndex: 'overallStatus',
      width: 120,
      render: (_: any, record: ClaimCase) => {
        const overallStatus = getOverallStatus(record);
        const meta = OVERALL_STATUS_META[overallStatus] || { label: overallStatus, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
  ];

  return (
    <Card title="案件查询" bordered={false}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Card size="small" title="筛选搜索功能区" styles={{ body: { paddingBottom: 8 } }}>
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {/* 第一行：精准搜索（占据主搜索条）+ 右侧时间范围 + 重置 */}
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} md={10}>
                <Input.Search
                  allowClear
                  placeholder="精准搜索：案件号 / 配送商名称"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onSearch={setKeyword}
                  enterButton
                />
              </Col>
              <Col xs={24} md={10}>
                <RangePicker
                  showTime
                  style={{ width: '100%' }}
                  value={dateRange}
                  onChange={(value) => setDateRange(value)}
                />
              </Col>
              <Col xs={24} md={4}>
                <Button block onClick={resetFilters}>重置条件</Button>
              </Col>
            </Row>

            {/* 第二行：左 3 列（省/市/区） + 右 1 列（案件类型） */}
            <Row gutter={[12, 12]}>
              <Col xs={24} md={5}>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="事故发生地省"
                  value={province || undefined}
                  options={areaIndex.provinceOptions}
                  onChange={(value) => {
                    setProvince(value || '');
                    setCity('');
                    setDistrict('');
                  }}
                />
              </Col>
              <Col xs={12} md={4}>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="事故发生地市"
                  value={city || undefined}
                  options={areaIndex.cityOptions}
                  onChange={(value) => {
                    setCity(value || '');
                    setDistrict('');
                  }}
                  disabled={!province}
                />
              </Col>
              <Col xs={12} md={4}>
                <Select
                  allowClear
                  showSearch
                  style={{ width: '100%' }}
                  placeholder="事故发生地区 / 县"
                  value={district || undefined}
                  options={areaIndex.districtOptions}
                  onChange={(value) => setDistrict(value || '')}
                  disabled={!province}
                />
              </Col>
              <Col xs={24} md={11}>
                <Select
                  mode="multiple"
                  allowClear
                  style={{ width: '100%' }}
                  placeholder="案件类型：骑手人伤 / 三者人伤 / 三者物损"
                  value={caseTypes}
                  options={CASE_TYPE_OPTIONS}
                  onChange={(value) => setCaseTypes(value)}
                  maxTagCount="responsive"
                />
              </Col>
            </Row>

            {/* 第三行：结果计数提示 + 整案状态过滤（轻量 chip 列表） */}
            <Row gutter={[12, 12]} align="middle" justify="space-between">
              <Col flex="auto">
                <Text type="secondary" style={{ fontSize: 12 }}>
                  当前共 {filteredCases.length} 条结果，支持按案件号、配送商名称、出险时间和事故发生地区快速定位。
                </Text>
              </Col>
            </Row>
          </Space>
        </Card>

        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredCases}
          columns={columns}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          onRow={(record) => ({
            onClick: () => navigate(`/cases/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Space>
    </Card>
  );
}
