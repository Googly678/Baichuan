import React, { useState, createContext, useContext } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/MainLayout";
import Dashboard from "./pages/Dashboard";
import ClaimDashboard from "./pages/dashboards/ClaimDashboard";
import AuditDashboard from "./pages/dashboards/AuditDashboard";
import LitigationDashboard from "./pages/dashboards/LitigationDashboard";
import AuxiliaryDashboard from "./pages/dashboards/AuxiliaryDashboard";
import SettingsDashboard from "./pages/dashboards/SettingsDashboard";
import CreateClaim from "./pages/CreateClaim";
import TaskDetail from "./pages/TaskDetail";
import CaseList from "./pages/CaseList";
import CaseIntake from "./pages/CaseIntake";
import AttachmentViewer from "./pages/AttachmentViewer";
import ReInspection from "./pages/ReInspection";
import Investigation from "./pages/Investigation";
import Litigation from "./pages/Litigation";
import { ROLE_WORKBENCHES, type WorkbenchKey } from "./utils/constants";

export const RoleContext = createContext<{ role: string; setRole: (r: string) => void }>({
  role: 'CUSTOMER_SERVICE',
  setRole: () => {},
});

const WB_PATH: Record<WorkbenchKey, string> = {
  claim:      '/dashboard/claim',
  audit:      '/dashboard/audit',
  litigation: '/dashboard/litigation',
  auxiliary:  '/dashboard/auxiliary',
  settings:   '/settings',
};

/** 登录后默认跳到当前角色第一个可见工作台 */
function RoleDefaultRedirect() {
  const { role } = useContext(RoleContext);
  const first = ROLE_WORKBENCHES[role]?.[0];
  const target = first ? WB_PATH[first] : '/dashboard';
  return <Navigate to={target} replace />;
}

export default function App() {
  const [role, setRole] = useState('CUSTOMER_SERVICE');

  return (
    <RoleContext.Provider value={{ role, setRole }}>
      <HashRouter>
        <Routes>
          {/* 单证管理：独立页面，不走主布局侧栏 */}
          <Route path="/attachments/:id" element={<AttachmentViewer />} />

          {/* 其余页面统一包裹在主布局内 */}
          <Route path="*" element={
            <MainLayout>
              <Routes>
                <Route path="/" element={<RoleDefaultRedirect />} />
                <Route path="/dashboard" element={<RoleDefaultRedirect />} />

                {/* 5 个工作台 */}
                <Route path="/dashboard/claim"      element={<ClaimDashboard />} />
                <Route path="/dashboard/audit"      element={<AuditDashboard />} />
                <Route path="/dashboard/litigation" element={<LitigationDashboard />} />
                <Route path="/dashboard/auxiliary"  element={<AuxiliaryDashboard />} />
                <Route path="/settings"             element={<SettingsDashboard />} />

                {/* 兼容老路由 */}
                <Route path="/intake" element={<CaseIntake />} />
                <Route path="/create" element={<CreateClaim />} />
                <Route path="/cases" element={<CaseList />} />
                <Route path="/cases/:id" element={<TaskDetail />} />
                <Route path="/tasks/:id" element={<TaskDetail />} />

                {/* 旧辅助页（deprecated） */}
                <Route path="/re-inspection" element={<ReInspection />} />
                <Route path="/investigation" element={<Investigation />} />
                <Route path="/litigation" element={<Litigation />} />

                <Route path="*" element={
                  <div style={{ padding: 48, textAlign: 'center', background: '#fff', borderRadius: 8 }}>
                    <h2>该模块尚未实装</h2>
                    <p>V2 开发计划中，敬请期待</p>
                  </div>
                } />
              </Routes>
            </MainLayout>
          } />
        </Routes>
      </HashRouter>
    </RoleContext.Provider>
  );
}
