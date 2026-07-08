import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Layout, Typography, Tag, Empty, Space, message, Spin, Button, Tooltip, Image, List, Alert, Modal, Select, Checkbox } from 'antd';
import {
  FileImageOutlined, FilePdfOutlined, FileTextOutlined,
  PaperClipOutlined, ZoomInOutlined, ZoomOutOutlined, UndoOutlined, RedoOutlined,
  UploadOutlined, DeleteOutlined, FolderOpenOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import { api } from '../utils/api';
import { recognizeIDCard, recognizeMedical, recognizeInvoice, recognizeText, type IDCardResult, type MedicalResult, type InvoiceResult } from '../utils/ocrRecognizer';
import type { AttachmentFile } from '../types/claim';

const { Sider, Content } = Layout;
const { Text, Title } = Typography;

interface SimplifiedFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'pdf' | 'document';
  dataUrl?: string;  // 用于存储图片/视频的Data URL
  ocrResult?: IDCardResult | MedicalResult | InvoiceResult | any;  // OCR识别结果
  recognizing?: boolean;  // 是否正在识别
}

type OCRApplyTarget = 'rider' | 'third' | 'generic';

// 保险理赔常用文件夹分类
const DOCUMENT_FOLDERS = [
  {
    key: 'identity_third',
    name: '身份证明（三者）',
    icon: '🆔',
    desc: '三者伤者身份证、户口本、护照等证件',
    color: '#1677ff',
  },
  {
    key: 'identity_rider',
    name: '身份证明（骑手）',
    icon: '🆔',
    desc: '骑手身份证、户口本、护照等证件',
    color: '#1677ff',
  },
  {
    key: 'medical_record_third',
    name: '医疗记录（三者）',
    icon: '🏥',
    desc: '三者诊断证明、医疗费单据、出院记录',
    color: '#52c41a',
  },
  {
    key: 'medical_record_rider',
    name: '医疗记录（骑手）',
    icon: '🏥',
    desc: '骑手诊断证明、医疗费单据、出院记录',
    color: '#52c41a',
  },
  {
    key: 'medical_invoice_third',
    name: '医疗费发票（三者）',
    icon: '💴',
    desc: '三者医疗费发票、收费票据',
    color: '#fa8c16',
  },
  {
    key: 'medical_invoice_rider',
    name: '医疗费发票（骑手）',
    icon: '💴',
    desc: '骑手医疗费发票、收费票据',
    color: '#fa8c16',
  },
  {
    key: 'medical_itemized_third',
    name: '医疗费用清单（三者）',
    icon: '🧾',
    desc: '三者住院费用清单、收费明细',
    color: '#13c2c2',
  },
  {
    key: 'medical_itemized_rider',
    name: '医疗费用清单（骑手）',
    icon: '🧾',
    desc: '骑手住院费用清单、收费明细',
    color: '#13c2c2',
  },
  {
    key: 'appraisal_report_third',
    name: '鉴定报告（三者）',
    icon: '📑',
    desc: '三者伤残鉴定、司法鉴定等报告',
    color: '#722ed1',
  },
  {
    key: 'appraisal_report_rider',
    name: '鉴定报告（骑手）',
    icon: '📑',
    desc: '骑手伤残鉴定、劳动能力鉴定等报告',
    color: '#722ed1',
  },
  {
    key: 'work',
    name: '工作证明',
    icon: '💼',
    desc: '收入证明、劳动合同、工资流水',
    color: '#faad14',
  },
  {
    key: 'accident',
    name: '事故证明',
    icon: '⚠️',
    desc: '事故现场照片、警报记录、责任认定书',
    color: '#ff4d4f',
  },
  {
    key: 'payment',
    name: '支付信息',
    icon: '🏦',
    desc: '付款账号、银行卡、收款说明等',
    color: '#2f54eb',
  },
  {
    key: 'repair',
    name: '维修单据',
    icon: '🔧',
    desc: '维修报价、维修清单、发票',
    color: '#722ed1',
  },
  {
    key: 'vehicle',
    name: '车辆文件',
    icon: '🚗',
    desc: '购车发票、行驶证、保养记录',
    color: '#13c2c2',
  },
  {
    key: 'other',
    name: '其他单证',
    icon: '📄',
    desc: '其他相关证明文件',
    color: '#666',
  },
];

export default function AttachmentViewer() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [files, setFiles] = useState<Record<string, SimplifiedFile[]>>({});
  const [loading, setLoading] = useState(true);
  const [imageScale, setImageScale] = useState(1);
  const [imageRotate, setImageRotate] = useState(0);
  const [selectedFile, setSelectedFile] = useState<SimplifiedFile | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>('');

  const toPercent = (confidence?: number) => {
    if (typeof confidence !== 'number' || Number.isNaN(confidence)) return 0;
    return confidence <= 1 ? confidence * 100 : confidence;
  };

  const taskType = searchParams.get('taskType') || '';
  const cacheKey = id ? `attachments-cache:${id}` : '';
  const defaultFolderByTask =
    taskType === 'rider_injury'
      ? 'identity_rider'
      : taskType === 'third_injury'
      ? 'identity_third'
      : DOCUMENT_FOLDERS[0].key;

  const normalizeFolderKey = (folderKey: string) => {
    if (folderKey === 'identity') {
      return taskType === 'rider_injury' ? 'identity_rider' : 'identity_third';
    }
    if (folderKey === 'medical') {
      return taskType === 'rider_injury' ? 'medical_record_rider' : 'medical_record_third';
    }
    if (folderKey === 'medical_third') return 'medical_record_third';
    if (folderKey === 'medical_rider') return 'medical_record_rider';
    return folderKey;
  };

  const inferApplyTarget = (folderKey: string): OCRApplyTarget => {
    if (folderKey.endsWith('_rider')) return 'rider';
    if (folderKey.endsWith('_third')) return 'third';
    return 'generic';
  };

  const isIdentityFolder = (folderKey: string) => folderKey.startsWith('identity_');
  const isMedicalRecordFolder = (folderKey: string) => folderKey.startsWith('medical_record_');
  const isInvoiceFolder = (folderKey: string) => folderKey.startsWith('medical_invoice_') || folderKey === 'repair';
  const isMedicalItemizedFolder = (folderKey: string) => folderKey.startsWith('medical_itemized_');
  const isAppraisalFolder = (folderKey: string) => folderKey.startsWith('appraisal_report_');

  const postOCRToTaskForm = (result: any, ocrType: string) => {
    if (!window.opener) {
      message.error('未检测到任务操作页，请从任务详情页打开单证管理后再应用。');
      return;
    }
    window.opener.postMessage(
      {
        type: 'OCR_RESULT',
        data: { ...result, type: ocrType },
        meta: {
          target: inferApplyTarget(selectedFolder),
          sourceFolder: selectedFolder,
          caseRef: id,
        },
      },
      '*'
    );
    message.success('识别结果已发送到任务页。');
  };

  const buildEmptyFilesMap = () => {
    const filesMap: Record<string, SimplifiedFile[]> = {};
    DOCUMENT_FOLDERS.forEach((folder) => {
      filesMap[folder.key] = [];
    });
    return filesMap;
  };

  const saveCache = (nextFiles: Record<string, SimplifiedFile[]>) => {
    if (!cacheKey) return;
    try {
      localStorage.setItem(cacheKey, JSON.stringify(nextFiles));
    } catch (e) {
      console.warn('缓存附件失败:', e);
    }
  };

  const loadCache = (): Record<string, SimplifiedFile[]> | null => {
    if (!cacheKey) return null;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as Record<string, SimplifiedFile[]>;
    } catch (e) {
      console.warn('读取附件缓存失败:', e);
      return null;
    }
  };

  // 初始化文件结构 - 从后端API加载
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    
    const loadAttachments = async () => {
      try {
        const attachments = await api.getAttachments(id);
        
        // 将后端格式转换为前端格式
        const filesMap = buildEmptyFilesMap();
        
        attachments.forEach((category: any) => {
          const normalizedKey = normalizeFolderKey(category.key);
          if (!filesMap[normalizedKey]) {
            filesMap[normalizedKey] = [];
          }
          filesMap[normalizedKey] = [...filesMap[normalizedKey], ...(category.files || [])];
        });
        
        setFiles(filesMap);
        saveCache(filesMap);
        setSelectedFolder(defaultFolderByTask);
        setLoading(false);
      } catch (err: any) {
        console.error('加载附件失败:', err);
        message.error(`加载附件失败：${err?.message || '请检查后端服务或案件ID'}`);

        // 生产兜底：优先使用本地缓存，避免“已上传看起来消失”
        const cached = loadCache();
        if (cached) {
          setFiles(cached);
          message.warning('已切换到本地缓存附件视图，待后端恢复后会自动同步显示。');
        } else {
          const filesMap = buildEmptyFilesMap();
          setFiles(filesMap);
        }
        setSelectedFolder(defaultFolderByTask);
        setLoading(false);
      }
    };
    
    loadAttachments();
  }, [id, defaultFolderByTask]);

  useEffect(() => {
    if (!selectedFile) return;
    const latest = (files[selectedFolder] || []).find((f) => f.id === selectedFile.id) || null;
    if (!latest) {
      setSelectedFile(null);
      return;
    }
    if (latest !== selectedFile) {
      setSelectedFile(latest);
    }
  }, [files, selectedFolder, selectedFile]);

  const currentFolderMeta = DOCUMENT_FOLDERS.find(f => f.key === selectedFolder);
  const currentFiles = files[selectedFolder] || [];

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <FileImageOutlined style={{ color: '#1677ff' }} />;
      case 'pdf':
        return <FilePdfOutlined style={{ color: '#cf1322' }} />;
      default:
        return <FileTextOutlined style={{ color: '#52c41a' }} />;
    }
  };

  const handleUpload = () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;  // 支持多文件选择
    fileInput.accept = 'image/*,video/*,.pdf';
    fileInput.onchange = async (e: Event) => {
      const selectedFiles = (e.target as HTMLInputElement).files;
      if (selectedFiles && selectedFiles.length > 0) {
        const newFilesList: SimplifiedFile[] = [];
        
        // 使用Promise处理异步文件读取
        const filePromises = Array.from(selectedFiles).map(file => {
          return new Promise<SimplifiedFile>((resolve) => {
            let type: 'image' | 'video' | 'pdf' | 'document' = 'document';
            if (file.type.startsWith('image/')) {
              type = 'image';
            } else if (file.type.startsWith('video/')) {
              type = 'video';
            } else if (file.type === 'application/pdf') {
              type = 'pdf';
            }
            
            // 对可预览文件统一保存 dataUrl，确保刷新后仍可预览
            if (type === 'image' || type === 'video' || type === 'pdf') {
              const reader = new FileReader();
              reader.onload = (event) => {
                resolve({
                  id: `${Date.now()}-${Math.random()}`,
                  name: file.name,
                  type: type,
                  dataUrl: event.target?.result as string,
                });
              };
              reader.readAsDataURL(file);
            } else {
              resolve({
                id: `${Date.now()}-${Math.random()}`,
                name: file.name,
                type: type,
              });
            }
          });
        });

        try {
          const uploadedFiles = await Promise.all(filePromises);
          
          // 立即更新本地状态
          setFiles((prev) => {
            const next = {
              ...prev,
              [selectedFolder]: [...(prev[selectedFolder] || []), ...uploadedFiles],
            };
            saveCache(next);
            return next;
          });

          // 调用后端API保存附件
          try {
            await api.addAttachments(id!, selectedFolder, uploadedFiles as any[]);

            message.success(`成功上传 ${uploadedFiles.length} 个文件到【${currentFolderMeta?.name}】`);
          } catch (apiError) {
            console.error('保存附件到后端失败:', apiError);
            // 回滚本地乐观更新，避免“看起来成功但刷新消失”
            setFiles((prev) => {
              const next = {
                ...prev,
                [selectedFolder]: (prev[selectedFolder] || []).filter(
                  (f) => !uploadedFiles.some((u) => u.id === f.id)
                ),
              };
              saveCache(next);
              return next;
            });
            message.error('上传失败：未保存到后端，已回滚本地数据。请检查后端服务和案件ID。');
          }
        } catch (error) {
          message.error('文件上传失败');
        }
      }
    };
    fileInput.click();
  };

  const handleDeleteFile = (fileId: string) => {
    const previousFolderFiles = files[selectedFolder] || [];
    const removedFile = previousFolderFiles.find((f) => f.id === fileId) || null;

    setFiles((prev) => {
      const next = {
        ...prev,
        [selectedFolder]: prev[selectedFolder]?.filter((f) => f.id !== fileId) || [],
      };
      saveCache(next);
      return next;
    });
    if (selectedFile?.id === fileId) {
      setSelectedFile(null);
    }
    
    // 调用后端API删除附件
    api.deleteAttachment(id!, selectedFolder, fileId)
      .then(() => {
        message.success('文件已删除');
      })
      .catch((err) => {
        console.error('删除附件失败:', err);
        setFiles((prev) => {
          const restored = {
            ...prev,
            [selectedFolder]: previousFolderFiles,
          };
          saveCache(restored);
          return restored;
        });
        if (removedFile && selectedFile?.id === fileId) {
          setSelectedFile(removedFile);
        }
        message.error('删除失败：已回滚本地改动，请重试。');
      });
  };

  // 触发OCR识别
  const triggerOCR = async (file: SimplifiedFile) => {
    if (!file.dataUrl || file.ocrResult) return; // 已识别或无法识别
    
    const fileName = file.name.toLowerCase();
    setFiles(prev => ({
      ...prev,
      [selectedFolder]: prev[selectedFolder]?.map(f => 
        f.id === file.id ? { ...f, recognizing: true } : f
      ) || [],
    }));

    try {
      let result;
      
      // 根据文件所在文件夹自动选择识别器
      if (isIdentityFolder(selectedFolder) || fileName.includes('身份证')) {
        result = await recognizeIDCard(file.dataUrl);
      } else if (isInvoiceFolder(selectedFolder) || fileName.includes('发票')) {
        result = await recognizeInvoice(file.dataUrl);
      } else if (isMedicalRecordFolder(selectedFolder) || isMedicalItemizedFolder(selectedFolder) || isAppraisalFolder(selectedFolder) || fileName.includes('病历') || fileName.includes('诊断') || fileName.includes('清单') || fileName.includes('鉴定')) {
        result = await recognizeMedical(file.dataUrl);
      } else {
        result = await recognizeText(file.dataUrl);
      }

      // 更新文件识别结果
      setFiles(prev => ({
        ...prev,
        [selectedFolder]: prev[selectedFolder]?.map(f => 
          f.id === file.id ? { ...f, ocrResult: result, recognizing: false } : f
        ) || [],
      }));
      setSelectedFile((prev) => (prev?.id === file.id ? { ...prev, ocrResult: result, recognizing: false } : prev));

      if (result.recognized) {
        message.success('文本识别成功！');
      }
    } catch (err) {
      console.error('OCR识别失败:', err);
      setFiles(prev => ({
        ...prev,
        [selectedFolder]: prev[selectedFolder]?.map(f => 
          f.id === file.id ? { ...f, recognizing: false } : f
        ) || [],
      }));
      setSelectedFile((prev) => (prev?.id === file.id ? { ...prev, recognizing: false } : prev));
      message.error('文本识别失败，请重试');
    }
  };

  // 批量移动文件到其他文件夹
  const handleBatchMove = () => {
    if (selectedFileIds.size === 0) {
      message.warning('请先选择要移动的文件');
      return;
    }
    if (!moveTargetFolder || moveTargetFolder === selectedFolder) {
      message.warning('请选择一个不同的目标文件夹');
      return;
    }

    const filesToMove = (files[selectedFolder] || []).filter(f => selectedFileIds.has(f.id));
    
    // 更新本地状态
    setFiles(prev => {
      const next = {
        ...prev,
        [selectedFolder]: (prev[selectedFolder] || []).filter(f => !selectedFileIds.has(f.id)),
        [moveTargetFolder]: [...(prev[moveTargetFolder] || []), ...filesToMove],
      };
      saveCache(next);
      return next;
    });

    // 调用后端API移动文件
    api.moveAttachments(id!, selectedFolder, moveTargetFolder, Array.from(selectedFileIds))
      .then(() => {
        message.success(`成功移动 ${selectedFileIds.size} 个文件`);
        setSelectedFileIds(new Set());
        setMoveModalVisible(false);
        setMoveTargetFolder('');
      })
      .catch((err) => {
        console.error('移动文件失败:', err);
        // 回滚本地状态
        setFiles(prev => {
          const next = {
            ...prev,
            [selectedFolder]: [...(prev[selectedFolder] || []), ...filesToMove],
            [moveTargetFolder]: (prev[moveTargetFolder] || []).filter(f => !filesToMove.some(m => m.id === f.id)),
          };
          saveCache(next);
          return next;
        });
        message.error('移动文件失败，已回滚。请检查后端服务。');
      });
  };

  // 切换文件选中状态
  const toggleFileSelection = (fileId: string) => {
    const newSet = new Set(selectedFileIds);
    if (newSet.has(fileId)) {
      newSet.delete(fileId);
    } else {
      newSet.add(fileId);
    }
    setSelectedFileIds(newSet);
  };

  // 全选/取消全选当前文件夹
  const toggleSelectAll = () => {
    if (selectedFileIds.size === currentFiles.length && currentFiles.length > 0) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(currentFiles.map(f => f.id)));
    }
  };

  // 图片控制工具栏
  const imgControls = selectedFile?.type === 'image' ? (
    <Space style={{ marginBottom: 12 }}>
      <Tooltip title="放大">
        <Button 
          size="small" 
          icon={<ZoomInOutlined />} 
          onClick={() => setImageScale(s => Math.min(s + 0.1, 3))} 
        />
      </Tooltip>
      <Tooltip title="缩小">
        <Button 
          size="small" 
          icon={<ZoomOutOutlined />} 
          onClick={() => setImageScale(s => Math.max(s - 0.1, 0.5))} 
        />
      </Tooltip>
      <span style={{ color: '#999', fontSize: 12 }}>缩放: {(imageScale * 100).toFixed(0)}%</span>
      <Tooltip title="逆时针旋转">
        <Button 
          size="small" 
          icon={<UndoOutlined />} 
          onClick={() => setImageRotate(r => r - 90)} 
        />
      </Tooltip>
      <Tooltip title="顺时针旋转">
        <Button 
          size="small" 
          icon={<RedoOutlined />} 
          onClick={() => setImageRotate(r => r + 90)} 
        />
      </Tooltip>
      <span style={{ color: '#999', fontSize: 12 }}>旋转: {imageRotate % 360}°</span>
    </Space>
  ) : null;

  const totalCount = Object.values(files).reduce((sum, list) => sum + list.length, 0);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
      {/* 顶部标题栏 */}
      <div style={{
        background: '#fff',
        padding: '12px 24px',
        borderBottom: '1px solid #e8e8e8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Space>
          <PaperClipOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <Title level={5} style={{ margin: 0 }}>单证管理</Title>
          <Tag color="blue">案件 {id}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>共 {totalCount} 份文件</Text>
          {currentFolderMeta && (
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 16 }}>
              当前文件夹：<strong>{currentFolderMeta.name}</strong> ({currentFiles.length} 份)
            </Text>
          )}
        </Space>
        {currentFolderMeta && (
          <Button 
            type="primary" 
            icon={<UploadOutlined />}
            onClick={handleUpload}
          >
            批量上传
          </Button>
        )}
      </div>

      {/* 主体布局 */}
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        {/* 左侧文件夹列表 */}
        <Sider
          width={240}
          style={{
            background: '#fff',
            borderRight: '1px solid #e8e8e8',
            overflow: 'auto',
            padding: '12px 0',
          }}
          collapsible={false}
        >
          <div style={{ padding: '8px 12px', color: '#888', fontSize: 12, fontWeight: 600 }}>
            文件夹分类
          </div>
          <List
            dataSource={DOCUMENT_FOLDERS}
            renderItem={(folder: typeof DOCUMENT_FOLDERS[0]) => (
              <div
                onClick={() => {
                  setSelectedFolder(folder.key);
                  setSelectedFile(null);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: selectedFolder === folder.key ? '#e6f7ff' : 'transparent',
                  borderLeft: selectedFolder === folder.key ? `3px solid ${folder.color}` : '3px solid transparent',
                  transition: 'all 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                }}
                onMouseEnter={(e) => {
                  if (selectedFolder !== folder.key) {
                    e.currentTarget.style.background = '#f5f5f5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedFolder !== folder.key) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <FolderOpenOutlined style={{ color: folder.color, fontSize: 16 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{folder.name}</div>
                </div>
                <Tag color={folder.color} style={{ margin: 0, fontSize: 11 }}>
                  {files[folder.key]?.length || 0}
                </Tag>
              </div>
            )}
          />
        </Sider>

        {/* 中间缩略图网格 */}
        <Content style={{ padding: '16px', overflow: 'auto', width: 'auto', flex: 0.5, borderRight: '1px solid #e8e8e8', background: '#fafafa', display: 'flex', flexDirection: 'column' }}>
          {/* 批量操作栏 */}
          {currentFiles.length > 0 && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px', background: '#f0f7ff', borderRadius: 6, border: '1px solid #b3e5fc' }}>
              <Checkbox 
                checked={selectedFileIds.size === currentFiles.length && currentFiles.length > 0}
                indeterminate={selectedFileIds.size > 0 && selectedFileIds.size < currentFiles.length}
                onChange={toggleSelectAll}
              >
                全选
              </Checkbox>
              <Text type="secondary">已选择 {selectedFileIds.size} 个文件</Text>
              {selectedFileIds.size > 0 && (
                <>
                  <Button 
                    type="primary" 
                    size="small"
                    onClick={() => setMoveModalVisible(true)}
                  >
                    批量移动
                  </Button>
                  <Button 
                    type="text" 
                    danger
                    size="small"
                    onClick={() => {
                      const fileIds = Array.from(selectedFileIds);
                      fileIds.forEach(fid => handleDeleteFile(fid));
                      setSelectedFileIds(new Set());
                    }}
                  >
                    批量删除
                  </Button>
                </>
              )}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', paddingTop: 40 }}>
              <Spin />
            </div>
          ) : currentFiles.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="此文件夹暂无文件"
              style={{ marginTop: 40 }}
            />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '12px',
            }}>
              {currentFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={() => {
                    setSelectedFile(file);
                    setImageScale(1);
                    setImageRotate(0);
                  }}
                  style={{
                    cursor: 'pointer',
                    border: selectedFile?.id === file.id ? '2px solid #1677ff' : '1px solid #d9d9d9',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#fff',
                    transition: 'all 0.3s',
                    position: 'relative',
                    outline: selectedFileIds.has(file.id) ? '2px solid #52c41a' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  {/* 文件复选框 */}
                  <Checkbox
                    checked={selectedFileIds.has(file.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleFileSelection(file.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: 4,
                      left: 4,
                      zIndex: 10,
                      background: 'rgba(255,255,255,0.9)',
                      borderRadius: 3,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {file.type === 'image' ? (
                    <div style={{
                      width: '100%',
                      height: '100px',
                      background: '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40,
                      color: '#1677ff',
                      overflow: 'hidden',
                    }}>
                      {(file.dataUrl || (file as any).url) ? (
                        <img 
                          src={file.dataUrl || (file as any).url}
                          alt={file.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        '🖼️'
                      )}
                    </div>
                  ) : file.type === 'pdf' ? (
                    <div style={{
                      width: '100%',
                      height: '100px',
                      background: '#fff2f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40,
                      color: '#cf1322',
                    }}>
                      📄
                    </div>
                  ) : file.type === 'video' ? (
                    <div style={{
                      width: '100%',
                      height: '100px',
                      background: '#e6f7ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40,
                      color: '#1677ff',
                      overflow: 'hidden',
                      position: 'relative',
                    }}>
                      {file.dataUrl ? (
                        <>
                          <video 
                            src={file.dataUrl}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                            }}
                          />
                          <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: 24,
                            background: 'rgba(0,0,0,0.5)',
                            borderRadius: '50%',
                            width: 40,
                            height: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                          }}>
                            ▶
                          </div>
                        </>
                      ) : (
                        '🎬'
                      )}
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100px',
                      background: '#f6f6f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 40,
                      color: '#666',
                    }}>
                      📋
                    </div>
                  )}
                  <div
                    title={file.name}
                    style={{
                      padding: '6px',
                      fontSize: '11px',
                      textAlign: 'center',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      borderTop: '1px solid #f0f0f0',
                    }}
                  >
                    {file.name}
                  </div>
                  {selectedFile?.id === file.id && (
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        background: 'rgba(255,255,255,0.8)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(file.id);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </Content>

        {/* 右侧预览区 */}
        <Layout style={{ flex: 1, background: '#fff', overflow: 'auto', position: 'relative' }}>
          {selectedFile ? (
            <div style={{ padding: 24, width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  {getFileIcon(selectedFile.type)}
                  <Text strong>{selectedFile.name}</Text>
                </Space>
                <Space>
                  {selectedFile.type === 'image' && !selectedFile.ocrResult && (
                    <Button
                      icon={<BarcodeOutlined />}
                      size="small"
                      loading={selectedFile.recognizing}
                      onClick={() => triggerOCR(selectedFile)}
                      type="primary"
                    >
                      识别文本
                    </Button>
                  )}
                  <Button
                    type="text"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteFile(selectedFile.id)}
                  >
                    删除
                  </Button>
                </Space>
              </div>

              {selectedFile.type === 'image' && (
                <>
                  {imgControls}
                  <div style={{
                    flex: 1,
                    background: '#f0f2f5',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed #d9d9d9',
                    overflow: 'auto',
                    minHeight: 300,
                  }}>
                    <div style={{
                      transform: `scale(${imageScale}) rotate(${imageRotate}deg)`,
                      transition: 'transform 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      maxWidth: '100%',
                      maxHeight: '100%',
                    }}>
                      {(selectedFile.dataUrl || (selectedFile as any).url) ? (
                        <img 
                          src={selectedFile.dataUrl || (selectedFile as any).url}
                          alt={selectedFile.name}
                          style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                          }}
                        />
                      ) : (
                        <FileImageOutlined style={{ fontSize: 64, color: '#1677ff', opacity: 0.4 }} />
                      )}
                    </div>
                  </div>

                  {/* OCR识别结果显示 */}
                  {selectedFile.ocrResult && (
                    <div style={{ marginTop: 16 }}>
                      <Alert
                        type="success"
                        message={`文本识别完成（信心度: ${toPercent(selectedFile.ocrResult.confidence).toFixed(0)}%）`}
                        showIcon
                        style={{ marginBottom: 12 }}
                      />
                      
                      {isIdentityFolder(selectedFolder) && selectedFile.ocrResult.idNumber && (
                        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                          <div style={{ marginBottom: 8 }}>
                            <strong>📋 身份证识别结果</strong>
                          </div>
                          {selectedFile.ocrResult.name && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>姓名:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.name}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.idNumber && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>身份证号:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.idNumber}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.birthday && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>出生日期:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.birthday}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.age && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>年龄:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.age}岁</span>
                            </div>
                          )}
                          <Button 
                            size="small" 
                            type="primary" 
                            style={{ marginTop: 8 }}
                            onClick={() => {
                              postOCRToTaskForm(selectedFile.ocrResult, 'id_card');
                            }}
                          >
                            应用到表单
                          </Button>
                        </div>
                      )}

                      {(isMedicalRecordFolder(selectedFolder) || isMedicalItemizedFolder(selectedFolder) || isAppraisalFolder(selectedFolder)) && selectedFile.ocrResult.diagnosis && (
                        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                          <div style={{ marginBottom: 8 }}>
                            <strong>🏥 病历识别结果</strong>
                          </div>
                          {selectedFile.ocrResult.diagnosis && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>诊断:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.diagnosis}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.date && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>日期:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.date}</span>
                            </div>
                          )}
                          <Button 
                            size="small" 
                            type="primary" 
                            style={{ marginTop: 8 }}
                            onClick={() => {
                              postOCRToTaskForm(selectedFile.ocrResult, 'medical');
                            }}
                          >
                            应用到表单
                          </Button>
                        </div>
                      )}

                      {selectedFolder === 'repair' && selectedFile.ocrResult.amount && (
                        <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                          <div style={{ marginBottom: 8 }}>
                            <strong>📄 发票识别结果</strong>
                          </div>
                          {selectedFile.ocrResult.amount && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>金额:</span> <span style={{ color: '#e82828', fontWeight: 600 }}>￥{selectedFile.ocrResult.amount.toFixed(2)}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.nonMedicalDrugAmount && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>非医保用药:</span> <span style={{ color: '#e82828', fontWeight: 600 }}>￥{selectedFile.ocrResult.nonMedicalDrugAmount.toFixed(2)}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.invoiceNo && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>发票号:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.invoiceNo}</span>
                            </div>
                          )}
                          {selectedFile.ocrResult.date && (
                            <div style={{ fontSize: 12, margin: '4px 0' }}>
                              <span style={{ color: '#666' }}>日期:</span> <span style={{ color: '#000', fontWeight: 500 }}>{selectedFile.ocrResult.date}</span>
                            </div>
                          )}
                          <Button 
                            size="small" 
                            type="primary" 
                            style={{ marginTop: 8 }}
                            onClick={() => {
                              postOCRToTaskForm(selectedFile.ocrResult, 'invoice');
                            }}
                          >
                            应用到表单
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {selectedFile.type === 'pdf' && (
                <div style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #ffa39e',
                  minHeight: 300,
                  overflow: 'hidden',
                }}>
                  {(selectedFile.dataUrl || (selectedFile as any).url) ? (
                    <iframe
                      title={selectedFile.name}
                      src={selectedFile.dataUrl || (selectedFile as any).url}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  ) : (
                    <Space direction="vertical" style={{ textAlign: 'center' }}>
                      <FilePdfOutlined style={{ fontSize: 64, color: '#cf1322', opacity: 0.4 }} />
                      <Text type="secondary">{selectedFile.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        无法预览：该文件缺少可用内容源，请重新上传该 PDF
                      </Text>
                    </Space>
                  )}
                </div>
              )}

              {selectedFile.type === 'video' && (
                <div style={{
                  flex: 1,
                  background: '#000',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #85c6ff',
                  minHeight: 300,
                  overflow: 'hidden',
                }}>
                  {(selectedFile.dataUrl || (selectedFile as any).url) ? (
                    <video
                      src={selectedFile.dataUrl || (selectedFile as any).url}
                      controls
                      style={{ width: '100%', maxHeight: '100%' }}
                    />
                  ) : (
                    <Space direction="vertical" style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 64 }}>🎬</div>
                      <Text type="secondary">{selectedFile.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        无法预览：该文件缺少可用内容源，请重新上传该视频
                      </Text>
                    </Space>
                  )}
                </div>
              )}

              {selectedFile.type === 'document' && (
                <div style={{
                  flex: 1,
                  background: '#f6f6f6',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px dashed #d9d9d9',
                  minHeight: 300,
                }}>
                  <Space direction="vertical" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 64 }}>📋</div>
                    <Text type="secondary">{selectedFile.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      文档预览（演示模式）
                    </Text>
                  </Space>
                </div>
              )}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请在中间栏选择文件进行预览/旋转"
              style={{ margin: 'auto' }}
            />
          )}
        </Layout>
      </Layout>

      {/* 批量移动模态框 */}
      <Modal
        title="批量移动文件"
        open={moveModalVisible}
        onOk={handleBatchMove}
        onCancel={() => {
          setMoveModalVisible(false);
          setMoveTargetFolder('');
        }}
        okText="确认移动"
        cancelText="取消"
        width={500}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>选择目标文件夹</Text>
        </div>
        <Select
          placeholder="选择目标文件夹"
          value={moveTargetFolder}
          onChange={setMoveTargetFolder}
          style={{ width: '100%', marginBottom: 16 }}
          options={DOCUMENT_FOLDERS.filter(f => f.key !== selectedFolder).map(f => ({
            label: `${f.icon} ${f.name}`,
            value: f.key,
            description: f.desc,
          }))}
          optionLabelProp="label"
        />
        <Alert
          message={`将移动 ${selectedFileIds.size} 个文件从【${currentFolderMeta?.name}】到选定的目标文件夹`}
          type="info"
          showIcon
          style={{ marginTop: 16 }}
        />
      </Modal>
    </div>
  );
}
