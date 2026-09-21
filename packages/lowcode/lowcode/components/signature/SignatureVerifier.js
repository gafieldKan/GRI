/**
 * 电子��名验证器
 * 提供��名验证、时间��、完整性校验等功能
 */
export class SignatureVerifier {
  constructor(config = {}) {
    this.config = {
      // ���证配置
      requireTimestamp: config.requireTimestamp !== false,
      requireSignerInfo: config.requireSignerInfo !== false,
      maxAge: config.maxAge || 365 * 24 * 60 * 60 * 1000, // 1 ����
      // 加密配置
      algorithm: config.algorithm || 'SHA-256',
      keySize: config.keySize || 2048,
      // 存��配置
      storageAdapter: config.storageAdapter || null,
      ...config
    };

    this.certificates = new Map();
    this.trustedCAs = new Set();
  }

  /**
   * 初始化验证器
   */
  async init() {
    // 加载 Web Crypto API
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('����器不支持 Web Crypto API');
    }

    // ��加载可信 CA
    await this._loadTrustedCAs();

    return this;
  }

  /**
   * 加载可信 CA 列表
   */
  async _loadTrustedCAs() {
    // ����认信任的 CA (实际项目中应从配置或服务器加载)
    this.trustedCAs.add('CN=GRI Root CA, O=GRI, C=CN');
    this.trustedCAs.add('CN=GRI Timestamp Authority, O=GRI, C=CN');
  }

  /**
   * ���证电子��名
   * @param {Object} signatureData - ����名数据
   * @returns {Promise<Object>} ���证结果
   */
  async verify(signatureData) {
    const result = {
      valid: false,
      checks: {
        format: false,
        integrity: false,
        timestamp: false,
        signer: false,
        certificate: false,
        revocation: false
      },
      details: {},
      errors: [],
      warnings: []
    };

    try {
      // 1. 格式验证
      const formatCheck = this._verifyFormat(signatureData);
      result.checks.format = formatCheck.valid;
      if (!formatCheck.valid) {
        result.errors.push(...formatCheck.errors);
      }
      result.details.format = formatCheck.details;

      // 2. 完整性验证
      const integrityCheck = await this._verifyIntegrity(signatureData);
      result.checks.integrity = integrityCheck.valid;
      if (!integrityCheck.valid) {
        result.errors.push(...integrityCheck.errors);
      }
      result.details.integrity = integrityCheck.details;

      // 3. 时间��验证
      if (this.config.requireTimestamp) {
        const timestampCheck = this._verifyTimestamp(signatureData);
        result.checks.timestamp = timestampCheck.valid;
        if (!timestampCheck.valid) {
          result.errors.push(...timestampCheck.errors);
        } else if (timestampCheck.warnings.length > 0) {
          result.warnings.push(...timestampCheck.warnings);
        }
        result.details.timestamp = timestampCheck.details;
      }

      // 4. ��署人验证
      if (this.config.requireSignerInfo) {
        const signerCheck = await this._verifySigner(signatureData);
        result.checks.signer = signerCheck.valid;
        if (!signerCheck.valid) {
          result.errors.push(...signerCheck.errors);
        }
        result.details.signer = signerCheck.details;
      }

      // 5. 证书��验证
      const certCheck = await this._verifyCertificate(signatureData);
      result.checks.certificate = certCheck.valid;
      if (!certCheck.valid) {
        result.errors.push(...certCheck.errors);
      }
      result.details.certificate = certCheck.details;

      // 6. ����状态��查
      const revocationCheck = await this._checkRevocation(signatureData);
      result.checks.revocation = revocationCheck.valid;
      if (!revocationCheck.valid) {
        result.warnings.push(...revocationCheck.warnings);
      }
      result.details.revocation = revocationCheck.details;

      // ��合判断
      result.valid = Object.values(result.checks).every(v => v === true);

      return result;
    } catch (error) {
      result.valid = false;
      result.errors.push(`验证过程��常: ${error.message}`);
      return result;
    }
  }

  /**
   * 格式验证
   */
  _verifyFormat(signatureData) {
    const errors = [];
    const details = {};

    // ��查必需字段
    const requiredFields = ['signature', 'data', 'algorithm', 'signer'];
    requiredFields.forEach(field => {
      if (!signatureData[field]) {
        errors.push(`��少必需字段: ${field}`);
      }
    });

    // ���证算法
    const supportedAlgorithms = ['SHA-256', 'SHA-384', 'SHA-512', 'RSASSA-PKCS1-v1_5', 'RSA-PSS', 'ECDSA'];
    if (signatureData.algorithm && !supportedAlgorithms.includes(signatureData.algorithm)) {
      errors.push(`不支持的算法: ${signatureData.algorithm}`);
    }

    // ���证��名格式 (Base64)
    if (signatureData.signature) {
      try {
        const decoded = atob(signatureData.signature);
        details.signatureLength = decoded.length;
        details.signatureValidBase64 = true;
      } catch (e) {
        errors.push('��名不是有效的 Base64 编码');
        details.signatureValidBase64 = false;
      }
    }

    details.requiredFieldsPresent = requiredFields.every(f => signatureData[f]);
    details.supportedAlgorithm = supportedAlgorithms.includes(signatureData.algorithm);

    return {
      valid: errors.length === 0,
      errors,
      details
    };
  }

  /**
   * 完整性验证
   */
  async _verifyIntegrity(signatureData) {
    const errors = [];
    const details = {};

    try {
      // 计算原始数据的哈希
      const dataToVerify = typeof signatureData.data === 'string'
        ? signatureData.data
        : JSON.stringify(signatureData.data);

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(dataToVerify);

      let algorithm;
      switch (signatureData.algorithm) {
        case 'SHA-256':
          algorithm = { name: 'SHA-256' };
          break;
        case 'SHA-384':
          algorithm = { name: 'SHA-384' };
          break;
        case 'SHA-512':
          algorithm = { name: 'SHA-512' };
          break;
        default:
          algorithm = { name: 'SHA-256' };
      }

      const hashBuffer = await window.crypto.subtle.digest(algorithm, dataBuffer);
      const calculatedHash = this._bufferToBase64(hashBuffer);

      // 如果有提供原始哈希，进行对比
      if (signatureData.hash) {
        details.calculatedHash = calculatedHash;
        details.providedHash = signatureData.hash;
        details.hashMatch = calculatedHash === signatureData.hash;

        if (calculatedHash !== signatureData.hash) {
          errors.push('数据完整性校验失败: ��希值不匹配');
        }
      } else {
        details.calculatedHash = calculatedHash;
        details.hashProvided = false;
      }

      // ���证数字��名 (如果有公��)
      if (signatureData.publicKey) {
        const signatureValid = await this._verifySignature(
          signatureData.data,
          signatureData.signature,
          signatureData.publicKey,
          signatureData.algorithm
        );
        details.signatureValid = signatureValid;

        if (!signatureValid) {
          errors.push('数字��名验证失败');
        }
      }

    } catch (error) {
      errors.push(`完整性验证��常: ${error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      details
    };
  }

  /**
   * ���证数字��名
   */
  async _verifySignature(data, signature, publicKey, algorithm) {
    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(typeof data === 'string' ? data : JSON.stringify(data));
      const signatureBuffer = this._base64ToBuffer(signature);

      let cryptoAlgorithm;
      let keyFormat;

      if (algorithm.includes('RSA')) {
        cryptoAlgorithm = {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: 'SHA-256' }
        };
        keyFormat = 'spki';
      } else if (algorithm === 'ECDSA') {
        cryptoAlgorithm = {
          name: 'ECDSA',
          namedCurve: 'P-256'
        };
        keyFormat = 'raw';
      } else {
        cryptoAlgorithm = {
          name: 'RSASSA-PKCS1-v1_5',
          hash: { name: 'SHA-256' }
        };
        keyFormat = 'spki';
      }

      // 导入公��
      const publicKeyBuffer = this._base64ToBuffer(publicKey);
      const cryptoKey = await window.crypto.subtle.importKey(
        keyFormat,
        publicKeyBuffer,
        cryptoAlgorithm,
        true,
        ['verify']
      );

      // ���证��名
      return await window.crypto.subtle.verify(
        cryptoAlgorithm,
        cryptoKey,
        signatureBuffer,
        dataBuffer
      );
    } catch (error) {
      console.error('��名验证失败:', error);
      return false;
    }
  }

  /**
   * 时间��验证
   */
  _verifyTimestamp(signatureData) {
    const errors = [];
    const warnings = [];
    const details = {};

    if (!signatureData.timestamp) {
      errors.push('��少时间��');
      return { valid: false, errors, warnings, details };
    }

    const timestamp = new Date(signatureData.timestamp).getTime();
    const now = Date.now();
    details.timestamp = signatureData.timestamp;
    details.timestampValid = !isNaN(timestamp);

    if (isNaN(timestamp)) {
      errors.push('时间��格式无效');
      return { valid: false, errors, warnings, details };
    }

    // ��查时间��是否过期
    if (this.config.maxAge && (now - timestamp) > this.config.maxAge) {
      warnings.push(`��名已过期 (${Math.round((now - timestamp) / (24 * 60 * 60 * 1000))} 天前)`);
    }

    // ��查时间��是否来自未来 (��许 5 分钟误差)
    if (timestamp > now + 5 * 60 * 1000) {
      errors.push('时间��来自未来，可能存在时���同步问题');
    }

    // ���证时间��机构 (TSA)
    if (signatureData.tsa) {
      details.tsa = signatureData.tsa;
      if (!this.trustedCAs.has(signatureData.tsa)) {
        warnings.push(`时间��机构 ${signatureData.tsa} 不在受信列表中`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      details
    };
  }

  /**
   * ��署人验证
   */
  async _verifySigner(signatureData) {
    const errors = [];
    const details = {};

    if (!signatureData.signer) {
      errors.push('��少��署人信息');
      return { valid: false, errors, details };
    }

    const signer = signatureData.signer;

    // ��查必需字段
    const requiredSignerFields = ['id', 'name'];
    requiredSignerFields.forEach(field => {
      if (!signer[field]) {
        errors.push(`��署人��少字段: ${field}`);
      }
    });

    // ���证����格式
    if (signer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer.email)) {
      errors.push('��署人����格式无效');
    }

    // ���证组织信息
    if (signer.organization) {
      details.organization = signer.organization;
    }

    // ���证证书序列号
    if (signer.certificateSerialNumber) {
      details.certificateSerialNumber = signer.certificateSerialNumber;
    }

    // ��查��署人是否在黑名单中 (实际项目中应查��数据库)
    if (await this._isSignerBlacklisted(signer.id)) {
      errors.push('��署人已被列入黑名单');
    }

    details.signerId = signer.id;
    details.signerName = signer.name;
    details.signerEmail = signer.email;

    return {
      valid: errors.length === 0,
      errors,
      details
    };
  }

  /**
   * ��查��署人是否在黑名单中
   */
  async _isSignerBlacklisted(signerId) {
    // 实际项目中应查��数据库或��存
    const blacklist = ['revoked-user-1', 'fraud-user-2'];
    return blacklist.includes(signerId);
  }

  /**
   * 证书��验证
   */
  async _verifyCertificate(signatureData) {
    const errors = [];
    const details = {};

    if (!signatureData.certificate) {
      errors.push('��少证书信息');
      return { valid: false, errors, details };
    }

    const cert = signatureData.certificate;

    // ���证证书格式
    if (!cert.subject || !cert.issuer || !cert.validFrom || !cert.validTo) {
      errors.push('证书格式不完整');
    }

    // ���证有效期
    const now = new Date();
    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (isNaN(validFrom.getTime()) || isNaN(validTo.getTime())) {
      errors.push('证书有效期格式无效');
    } else {
      if (now < validFrom) {
        errors.push('证书尚未生效');
      }
      if (now > validTo) {
        errors.push('证书已过期');
      }
    }

    // ���证��发机构
    if (cert.issuer) {
      details.issuer = cert.issuer;
      if (!this.trustedCAs.has(cert.issuer)) {
        errors.push(`��发机构 ${cert.issuer} 不受信任`);
      }
    }

    // ���证证书指��
    if (cert.fingerprint) {
      details.fingerprint = cert.fingerprint;
    }

    // ���证密��用法
    if (cert.keyUsage) {
      const requiredUsages = ['digitalSignature', 'nonRepudiation'];
      const hasRequiredUsage = requiredUsages.some(u => cert.keyUsage.includes(u));
      if (!hasRequiredUsage) {
        warnings.push('证书密��用法可能不包含数字��名');
      }
      details.keyUsage = cert.keyUsage;
    }

    // ���证证书�� (简化版)
    if (cert.chain) {
      details.chainLength = cert.chain.length;
      // 实际项目中应��归验证每一级证书
    }

    return {
      valid: errors.length === 0,
      errors,
      details
    };
  }

  /**
   * ����状态��查 (CRL/OCSP)
   */
  async _checkRevocation(signatureData) {
    const warnings = [];
    const details = {};

    if (!signatureData.certificate || !signatureData.certificate.serialNumber) {
      details.revocationChecked = false;
      details.reason = '��少证书序列号';
      return { valid: true, warnings, details };
    }

    try {
      // 实际项目中应查�� CRL 或 OCSP
      // 这里模����查
      const revokedSerialNumbers = ['SN-REVOKED-001', 'SN-REVOKED-002'];
      const serialNumber = signatureData.certificate.serialNumber;

      if (revokedSerialNumbers.includes(serialNumber)) {
        warnings.push('证书已被����');
        details.revoked = true;
      } else {
        details.revoked = false;
      }

      details.revocationChecked = true;
      details.checkMethod = 'simulated';

    } catch (error) {
      warnings.push(`����状态��查失败: ${error.message}`);
      details.revocationChecked = false;
      details.error = error.message;
    }

    return {
      valid: true, // ������查失败不直接导致验证失败，只发出警告
      warnings,
      details
    };
  }

  /**
   * 批量验证
   */
  async verifyBatch(signatures) {
    const results = await Promise.all(
      signatures.map(sig => this.verify(sig))
    );

    return {
      total: signatures.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      results
    };
  }

  /**
   * 注册可信 CA
   */
  addTrustedCA(caSubject) {
    this.trustedCAs.add(caSubject);
  }

  /**
   * 移除可信 CA
   */
  removeTrustedCA(caSubject) {
    this.trustedCAs.delete(caSubject);
  }

  /**
   * Base64 �� ArrayBuffer
   */
  _base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * ArrayBuffer �� Base64
   */
  _bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 生成验证报告
   */
  generateReport(verificationResult) {
    return {
      summary: {
        valid: verificationResult.valid,
        totalChecks: Object.keys(verificationResult.checks).length,
        passedChecks: Object.values(verificationResult.checks).filter(v => v).length,
        timestamp: new Date().toISOString()
      },
      checks: verificationResult.checks,
      details: verificationResult.details,
      errors: verificationResult.errors,
      warnings: verificationResult.warnings
    };
  }
}

export default SignatureVerifier;