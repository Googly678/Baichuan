/**
 * 系统设置
 * 字典维护、ICD-10 导入、用户/角色管理
 */
import React from 'react';
import { Card, Empty, Typography, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

export default function SettingsDashboard() {
  return (
    <Card title={<Space><SettingOutlined /><b>系统设置</b></Space>} bordered={false}>
      <Empty
        description={
          <div>
            <Title level={4} style={{ marginTop: 8 }}>设置模块规划中</Title>
            <Paragraph type="secondary">即将支持：字典维护、ICD-10 导入、角色/用户、参数配置</Paragraph>
          </div>
        }
      />
    </Card>
  );
}
