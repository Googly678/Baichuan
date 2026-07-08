/**
 * 理赔工作台
 * - 客服：显示"待分流报案池"
 * - 查勘员：显示 9 个查勘员池（人伤/车损/物损 ×立案/协议/定损）
 * - 管理员：3 列分组（人伤/车损/物损）
 * - 其它角色（人伤/物损审核员）看到空状态或受限提示
 */
import React from 'react';
import Dashboard from '../Dashboard';

export default function ClaimDashboard() {
  return <Dashboard workbenchKey="claim" />;
}
