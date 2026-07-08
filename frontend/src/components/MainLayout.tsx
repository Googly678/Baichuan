import React, { useState, useContext, useMemo } from "react";
import { Layout, Menu, Typography, Avatar, Dropdown, Space, Badge, Select } from "antd";
import {
  DashboardOutlined,
  FileSearchOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  ArrowLeftOutlined,
  AuditOutlined,
  EnvironmentOutlined,
  TeamOutlined,
  MedicineBoxOutlined,
  CarOutlined,
  FileTextOutlined,
  ToolOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { RoleContext } from "../App";
import { WORKBENCHES, ROLE_WORKBENCHES, type WorkbenchKey } from "../utils/constants";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

// ─── 角色配置 ────────────────────────────────────────────────────────────────
const ROLE_OPTIONS = [
  { value: 'CUSTOMER_SERVICE',     label: '客服专员' },
  { value: 'ADMIN',                label: '管理人' },
  { value: 'INJURY_SURVEYOR',      label: '人伤查勘员' },
  { value: 'INJURY_AUDITOR',       label: '人伤审核员' },
  { value: 'PROPERTY_SURVEYOR',    label: '物损查勘员' },
  { value: 'PROPERTY_AUDITOR',     label: '物损审核员' },
  { value: 'LITIGATION_OPERATOR',  label: '诉讼作业岗' },
  { value: 'LITIGATION_AUDITOR',   label: '诉讼审核岗' },
];

/** 5 个工作台对应的 icon */
const WB_ICON: Record<WorkbenchKey, React.ReactNode> = {
  claim:      <DashboardOutlined />,
  audit:      <AuditOutlined />,
  litigation: <FileTextOutlined />,
  auxiliary:  <ToolOutlined />,
  settings:   <SettingOutlined />,
};

/** 角色切换后默认跳转路径（首工作台路径） */
const ROLE_DEFAULT_PATH: Record<string, string> = {
  CUSTOMER_SERVICE:    '/dashboard/claim',
  INJURY_SURVEYOR:     '/dashboard/claim',
  INJURY_AUDITOR:      '/dashboard/audit',
  PROPERTY_SURVEYOR:   '/dashboard/claim',
  PROPERTY_AUDITOR:    '/dashboard/audit',
  LITIGATION_OPERATOR: '/dashboard/litigation',
  LITIGATION_AUDITOR:  '/dashboard/litigation',
  ADMIN:               '/dashboard/claim',
};

const ROLE_AVATAR_COLOR: Record<string, string> = {
  CUSTOMER_SERVICE:    '#faad14',
  ADMIN:               '#f50',
  INJURY_SURVEYOR:     '#13c2c2',
  INJURY_AUDITOR:      '#2db7f5',
  PROPERTY_SURVEYOR:   '#52c41a',
  PROPERTY_AUDITOR:    '#722ed1',
  LITIGATION_OPERATOR: '#c41d7f',
  LITIGATION_AUDITOR:  '#a8071a',
};

const ROLE_NAME: Record<string, string> = {
  CUSTOMER_SERVICE:    '客服-阿玲',
  ADMIN:               '管理人-王五',
  INJURY_SURVEYOR:     '人伤查勘-小李',
  INJURY_AUDITOR:      '人伤审核-赵六',
  PROPERTY_SURVEYOR:   '物损查勘-小张',
  PROPERTY_AUDITOR:    '物损审核-钱七',
  LITIGATION_OPERATOR: '诉讼作业-孙八',
  LITIGATION_AUDITOR:  '诉讼审核-周九',
};

// ─── 菜单：1 套 5 工作台 + 案件查询（按 ROLE_WORKBENCHES 过滤可见性）─────────
function buildMenu(role: string): any[] {
  const allowed = new Set(ROLE_WORKBENCHES[role] || []);
  const wbItems = WORKBENCHES
    .filter((wb) => allowed.has(wb.key))
    .map((wb) => ({
      key: wb.path,
      icon: WB_ICON[wb.key],
      // 客服专员只做接报案 & 分流，工作台对她显示为"报案工作台"
      label: (role === 'CUSTOMER_SERVICE' && wb.key === 'claim') ? '报案工作台' : wb.label,
    }));

  // "案件查询"对所有非纯诉讼/审核角色可见
  const isLitigationOnly = role === 'LITIGATION_OPERATOR' || role === 'LITIGATION_AUDITOR';
  const items: any[] = [...wbItems];
  if (!isLitigationOnly) {
    items.push({ key: '/cases', icon: <FileSearchOutlined />, label: '案件查询' });
  }
  // 客服专员专属：新建接件 + 新建报案
  // （与"报案工作台"配合：工作台是"接报案后的池子"，这两个是"开始接件/报案"入口）
  if (role === 'CUSTOMER_SERVICE') {
    items.push({ key: '/intake', icon: <PlusOutlined />, label: '新建接件' });
    items.push({ key: '/create', icon: <PlusOutlined />, label: '新建报案' });
  }
  // 管理员专属：辅助管理（兼容旧路由）
  if (role === 'ADMIN') {
    items.push({
      key: 'sub_extra', icon: <TeamOutlined />, label: '辅助管理（旧）',
      children: [
        { key: '/re-inspection', icon: <EnvironmentOutlined />, label: '复勘管理' },
        { key: '/investigation',                                  label: '调查任务管理' },
        { key: '/litigation',                                     label: '诉讼登记管理' },
      ],
    });
  }
  return items;
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const { role, setRole } = useContext(RoleContext);
  const siderWidth = collapsed ? 80 : 220;
  const isDetailPage = /^\/(cases|tasks)\/.+/.test(location.pathname);

  const currentMenus = useMemo(() => buildMenu(role), [role]);
  const openKeys = currentMenus.filter((m: any) => m.children).map((m: any) => m.key as string);

  // 通知数量（演示）
  const notifyCount = role === 'ADMIN' ? 9
    : role === 'INJURY_SURVEYOR' ? 4
    : role === 'INJURY_AUDITOR' ? 3
    : role === 'PROPERTY_SURVEYOR' ? 2
    : 1;

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        theme="light"
        style={{
          boxShadow: "2px 0 8px 0 rgba(29,35,41,.05)",
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          height: '100vh',
          overflow: 'auto',
          zIndex: 100,
        }}
      >
        <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #f0f0f0" }}>
          <Title level={4} style={{ margin: 0, color: "#1890ff" }}>
            {collapsed ? "理赔" : "百川归流"}
          </Title>
        </div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={openKeys}
          items={currentMenus}
          onClick={({ key }) => { if (key.startsWith('/')) navigate(key); }}
          style={{ borderRight: 0, paddingTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: siderWidth, transition: 'margin-left 0.2s' }} data-sider-width={siderWidth}>
        <Header
          style={{
            padding: "0 24px",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,21,41,.08)",
            zIndex: 1,
          }}
        >
          <Space size="large">
            {isDetailPage ? (
              <Space
                onClick={() => navigate(ROLE_DEFAULT_PATH[role] || '/cases')}
                style={{ cursor: 'pointer', color: '#1677ff', fontWeight: 500 }}
              >
                <ArrowLeftOutlined style={{ fontSize: 16 }} />
                <span>返回工作台</span>
              </Space>
            ) : React.createElement(collapsed ? MenuUnfoldOutlined : MenuFoldOutlined, {
              onClick: () => setCollapsed(!collapsed),
              style: { fontSize: 18, cursor: "pointer" },
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>演示角色:</span>
              <Select
                value={role}
                onChange={(val) => { setRole(val); navigate(ROLE_DEFAULT_PATH[val] ?? '/dashboard'); }}
                style={{ width: 130 }}
                size="small"
                options={ROLE_OPTIONS}
              />
            </div>
          </Space>

          <Space size="large">
            <Badge count={notifyCount}>
              <BellOutlined style={{ fontSize: 20, cursor: "pointer" }} />
            </Badge>
            <Dropdown
              menu={{
                items: [
                  { key: "name", label: ROLE_NAME[role] || role, disabled: true },
                  { type: 'divider' },
                  { key: "1", label: "个人中心" },
                  { key: "2", label: "退出登录", danger: true },
                ],
              }}
            >
              <Space style={{ cursor: "pointer" }}>
                <Avatar
                  size="small"
                  style={{ backgroundColor: ROLE_AVATAR_COLOR[role] || '#1890ff' }}
                  icon={<UserOutlined />}
                />
                <span style={{ fontSize: 13 }}>{ROLE_NAME[role] || role}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: "16px",
            padding: "16px",
            background: "transparent",
            minHeight: 280,
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

