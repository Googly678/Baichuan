import { createWorker } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  recognized: boolean;
}

export interface IDCardResult extends OCRResult {
  idNumber?: string;
  birthday?: string;
  age?: number;
  name?: string;
  address?: string;
}

export interface MedicalResult extends OCRResult {
  diagnosis?: string;
  date?: string;
}

export interface InvoiceResult extends OCRResult {
  amount?: number;
  date?: string;
  invoiceNo?: string;
  nonMedicalDrugAmount?: number;
}

let worker: any = null;

const normalizeOCRText = (input: string) =>
  input
    .replace(/\r/g, '\n')
    .replace(/[：:]/g, ':')
    .replace(/\s+/g, ' ')
    .trim();

const extractIDCardName = (text: string) => {
  const compact = text.replace(/\s+/g, '');
  const directName = compact.match(/姓名[:：]?([\u4e00-\u9fa5·]{2,12})/);
  if (directName) return directName[1].trim();

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/姓名/.test(line)) {
      const inline = line.match(/姓名[:：]?\s*([\u4e00-\u9fa5·]{2,12})/);
      if (inline) return inline[1].trim();
      const next = lines[index + 1] || '';
      if (/^[\u4e00-\u9fa5·]{2,12}$/.test(next)) return next;
    }
  }

  const candidate = compact.match(/([\u4e00-\u9fa5·]{2,12})(?=民族|性别|出生|住址|公民身份号码|\d{17}[0-9Xx])/);
  return candidate ? candidate[1].trim() : undefined;
};

const extractIDCardAddress = (text: string) => {
  const normalized = text.replace(/\r/g, '\n');
  const inline = normalized.match(/住址[:：]?\s*([^\n]+)/);
  if (inline?.[1]) {
    return inline[1].replace(/\s+/g, '').trim();
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/住址/.test(line)) {
      const collected: string[] = [];
      const inlineAddress = line.replace(/^.*住址[:：]?\s*/, '').trim();
      if (inlineAddress) collected.push(inlineAddress);
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const candidate = lines[cursor];
        if (/公民身份号码|签发机关|有效期限|出生|性别|民族/.test(candidate)) break;
        collected.push(candidate);
        if (candidate.length >= 8 && /省|市|区|县|镇|乡|村|路|街|号/.test(candidate)) break;
      }
      const address = collected.join('').replace(/\s+/g, '').trim();
      if (address) return address;
    }
  }

  return undefined;
};

const initWorker = async () => {
  if (!worker) {
    worker = await createWorker('chi_sim', 1, {
      logger: (m: any) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR进度: ${Math.round(m.progress * 100)}%`);
        }
      },
    } as any);
  }
  return worker;
};

const parseBirthdayFromIdNumber = (idNumber?: string) => {
  if (!idNumber || idNumber.length !== 18) return undefined;
  const birthStr = idNumber.substring(6, 14);
  const year = Number(birthStr.substring(0, 4));
  const month = Number(birthStr.substring(4, 6));
  const day = Number(birthStr.substring(6, 8));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return undefined;
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// 身份证识别
export const recognizeIDCard = async (imageUrl: string): Promise<IDCardResult> => {
  try {
    const w = await initWorker();
    const { data } = await w.recognize(imageUrl);
    const text = data.text;
    const normalizedText = normalizeOCRText(text);

    // 提取身份证号（18位数字）
    const idMatch = text.match(/\d{17}[0-9Xx]/);
    const idNumber = idMatch ? idMatch[0] : undefined;

    // 提取并校验出生日期（身份证号第7-14位）
    const birthday = parseBirthdayFromIdNumber(idNumber);

    // 计算年龄
    let age = undefined;
    if (birthday) {
      const birthDate = new Date(birthday);
      const today = new Date();
      if (!Number.isNaN(birthDate.getTime())) {
        age = today.getFullYear() - birthDate.getFullYear();
        if (today.getMonth() < birthDate.getMonth() ||
            (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate())) {
          age--;
        }
        if (!Number.isFinite(age) || age < 0 || age > 130) {
          age = undefined;
        }
      }
    }

    // 提取姓名（通常在身份证号前）
    const name = extractIDCardName(text);
    const address = extractIDCardAddress(text);

    return {
      text: normalizedText,
      confidence: data.confidence,
      recognized: !!idNumber && !!birthday,
      idNumber,
      birthday,
      age,
      name,
      address,
    };
  } catch (error) {
    console.error('身份证识别失败:', error);
    return {
      text: '',
      confidence: 0,
      recognized: false,
    };
  }
};

// 病历识别
export const recognizeMedical = async (imageUrl: string): Promise<MedicalResult> => {
  try {
    const w = await initWorker();
    const { data } = await w.recognize(imageUrl);
    let text = data.text;

    // 提取诊断关键词（诊断、诊断结果、初步诊断等）
    const diagnosisMatch = text.match(/(?:诊断|主诉|初步诊断|诊断结果)[：:]*\s*([^\n。，,;]+)/);
    const diagnosis = diagnosisMatch ? diagnosisMatch[1].trim() : undefined;

    // 提取日期（YYYY-MM-DD、YYYY/MM/DD、YYYY年MM月DD日等格式）
    const dateMatch = text.match(/(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}日?)/);
    const date = dateMatch ? dateMatch[1] : undefined;

    return {
      text: text.trim(),
      confidence: data.confidence,
      recognized: !!diagnosis,
      diagnosis,
      date,
    };
  } catch (error) {
    console.error('病历识别失败:', error);
    return {
      text: '',
      confidence: 0,
      recognized: false,
    };
  }
};

// 发票识别
export const recognizeInvoice = async (imageUrl: string): Promise<InvoiceResult> => {
  try {
    const w = await initWorker();
    const { data } = await w.recognize(imageUrl);
    let text = data.text;

    // 提取金额（￥或人民币或直接数字）
    const amountMatch = text.match(/[￥人民币]*\s*(\d+[.,]\d{2}|\d+)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(',', '')) : undefined;

    // 提取日期
    const dateMatch = text.match(/(\d{4}[-\/年]\d{1,2}[-\/月]\d{1,2}日?)/);
    const date = dateMatch ? dateMatch[1] : undefined;

    // 提取发票号
    const invoiceMatch = text.match(/(?:发票号|票号|No[.:]?)\s*([A-Za-z0-9]+)/i);
    const invoiceNo = invoiceMatch ? invoiceMatch[1] : undefined;

    // 提取非医保用药金额（关键词：自费、自付、非医保等）
    const nonMedicalMatch = text.match(/(?:自费|自付|非医保)[：:]*\s*(\d+[.,]\d{2}|\d+)/);
    const nonMedicalDrugAmount = nonMedicalMatch ? parseFloat(nonMedicalMatch[1].replace(',', '')) : undefined;

    return {
      text: text.trim(),
      confidence: data.confidence,
      recognized: !!amount,
      amount,
      date,
      invoiceNo,
      nonMedicalDrugAmount,
    };
  } catch (error) {
    console.error('发票识别失败:', error);
    return {
      text: '',
      confidence: 0,
      recognized: false,
    };
  }
};

// 通用文本识别
export const recognizeText = async (imageUrl: string): Promise<OCRResult> => {
  try {
    const w = await initWorker();
    const { data } = await w.recognize(imageUrl);
    return {
      text: data.text.trim(),
      confidence: data.confidence,
      recognized: data.text && data.text.trim().length > 0,
    };
  } catch (error) {
    console.error('文本识别失败:', error);
    return {
      text: '',
      confidence: 0,
      recognized: false,
    };
  }
};

// 清理资源
export const terminateOCR = async () => {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
};
