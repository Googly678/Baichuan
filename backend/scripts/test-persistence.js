const fs = require('fs');
const path = require('path');
const http = require('http');

const dataFile = path.join(__dirname, '../data/demo-db.json');

console.log('数据持久化测试\n');
console.log('数据文件:', dataFile);

// 读取初始修改时间
const beforeStats = fs.statSync(dataFile);
console.log('修改前时间:', beforeStats.mtime);

// 读取案件列表
const db = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
const firstCaseId = db.cases[0].id;
console.log('案件 ID:', firstCaseId);
console.log('');

// 构建测试数据
const timestamp = new Date().toISOString();
const testRemark = `测试备注 - ${timestamp}`;

const payload = {
  audit_logs: [
    {
      timestamp,
      user_id: 'test-user',
      action: 'save',
      remark: testRemark
    }
  ]
};

console.log('发送 PUT 请求...');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/claims/${firstCaseId}`,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('响应状态:', res.statusCode);
    console.log('响应内容:', data.substring(0, 100));
    console.log('');
    
    // 等待 2 秒，确保文件写入完成
    setTimeout(() => {
      try {
        const afterStats = fs.statSync(dataFile);
        console.log('修改后时间:', afterStats.mtime);
        
        if (beforeStats.mtime.getTime() !== afterStats.mtime.getTime()) {
          console.log('✓ 成功: 文件已被修改!');
          
          // 验证数据内容
          const updatedDb = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
          const updatedCase = updatedDb.cases.find(c => c.id === firstCaseId);
          if (updatedCase && updatedCase.audit_logs && updatedCase.audit_logs.length > 0) {
            const lastLog = updatedCase.audit_logs[updatedCase.audit_logs.length - 1];
            if (lastLog.remark === testRemark) {
              console.log('✓ 成功: 数据已正确保存!');
              console.log('保存的备注:', lastLog.remark);
            } else {
              console.log('✗ 错误: 备注未被保存');
              console.log('最后一条日志:', lastLog);
            }
          }
        } else {
          console.log('✗ 错误: 文件未被修改!');
        }
      } catch (err) {
        console.error('检查文件时出错:', err.message);
      }
      
      process.exit(0);
    }, 2000);
  });
});

req.on('error', (error) => {
  console.error('请求错误:', error);
  process.exit(1);
});

req.write(JSON.stringify(payload));
req.end();

// 超时处理
setTimeout(() => {
  console.error('请求超时');
  process.exit(1);
}, 15000);
