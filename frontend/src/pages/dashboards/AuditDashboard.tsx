/**
 * 审核工作台
 * - 人伤审核员/物损审核员：9 个审核员池
 * - 管理员：3 列分组
 * - 其它角色：受限
 */
import React from 'react';
import Dashboard from '../Dashboard';

export default function AuditDashboard() {
  return <Dashboard workbenchKey="audit" />;
}
