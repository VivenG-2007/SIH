import { Company, CompanyType, BusinessContext, BusinessPriority, PriorityLevel } from '../types';

export const DEMO_COMPANIES: Record<CompanyType, Company> = {
  Banking: {
    name: 'FinBank Technologies',
    type: 'Banking',
    industry: 'Financial Services & Retail Banking',
    keyServices: ['Payment System', 'Customer Portal', 'Employee Portal', 'Public Website', 'APIs'],
    importantAssets: ['Customer Database', 'Payment System', 'Authentication System', 'Cloud Infrastructure'],
    dataSensitivity: ['Financial', 'Personal', 'Highly Sensitive'],
    annualSecurityBudget: 1000000, // ₹10 Lakhs or $100K
    currency: 'INR',
    annualRevenueEstimated: 500000000,
  },
  Healthcare: {
    name: 'HealthGuard Medical Center',
    type: 'Healthcare',
    industry: 'Digital Health & Clinical Care',
    keyServices: ['Patient Portal', 'EHR System', 'Telemedicine APIs', 'Pharmacy System'],
    importantAssets: ['Electronic Health Records', 'Patient Database', 'Diagnostic Equipment', 'Identity Provider'],
    dataSensitivity: ['Personal', 'Highly Sensitive', 'Confidential'],
    annualSecurityBudget: 1200000,
    currency: 'INR',
    annualRevenueEstimated: 400000000,
  },
  'SaaS / Cloud': {
    name: 'CloudScale B2B Platform',
    type: 'SaaS / Cloud',
    industry: 'Cloud Infrastructure & Enterprise SaaS',
    keyServices: ['Customer Portal', 'Core APIs', 'Data Platform', 'Authentication System'],
    importantAssets: ['Multi-Tenant Database', 'Kubernetes Clusters', 'API Gateway', 'Secrets Vault'],
    dataSensitivity: ['Confidential', 'Financial', 'Personal'],
    annualSecurityBudget: 1500000,
    currency: 'INR',
    annualRevenueEstimated: 600000000,
  },
  Retail: {
    name: 'RetailSphere Global',
    type: 'Retail',
    industry: 'E-Commerce & Supply Chain',
    keyServices: ['Payment System', 'Public Website', 'Customer Portal', 'Logistics Platform'],
    importantAssets: ['Payment Gateway', 'Customer Database', 'Inventory ERP', 'POS Integration'],
    dataSensitivity: ['Financial', 'Personal', 'Internal'],
    annualSecurityBudget: 800000,
    currency: 'INR',
    annualRevenueEstimated: 350000000,
  },
  'Critical Infrastructure / Energy': {
    name: 'PowerGrid Dynamics',
    type: 'Critical Infrastructure / Energy',
    industry: 'Energy Generation & Smart Grid',
    keyServices: ['SCADA Network', 'Grid Monitoring', 'Employee Portal', 'Telemetry Ingestion'],
    importantAssets: ['Industrial Control Systems', 'Substation Telemetry', 'Cloud Infrastructure', 'Turbine Controllers'],
    dataSensitivity: ['Confidential', 'Highly Sensitive', 'Internal'],
    annualSecurityBudget: 2000000,
    currency: 'INR',
    annualRevenueEstimated: 900000000,
  },
  Defense: {
    name: 'AeroShield Defense Systems',
    type: 'Defense',
    industry: 'Defense Aerospace & Secure Communications',
    keyServices: ['Tactical C2 Network', 'Secure Communication APIs', 'Telemetry Platform'],
    importantAssets: ['Classified Data Store', 'Satellite Links', 'Cryptographic Hardware', 'Air-Gapped Vault'],
    dataSensitivity: ['Highly Sensitive', 'Confidential', 'Internal'],
    annualSecurityBudget: 2500000,
    currency: 'INR',
    annualRevenueEstimated: 1200000000,
  },
};

export function generateBusinessContext(company: Company): BusinessContext {
  const isBanking = company.type === 'Banking';
  const isHealth = company.type === 'Healthcare';
  const isSaaS = company.type === 'SaaS / Cloud';

  const businessTypeAndGoals = isBanking
    ? `Commercial and digital retail banking organization focused on seamless high-throughput digital transactions, zero-downtime payments, and strict regulatory compliance.`
    : isHealth
    ? `Healthcare provider managing sensitive electronic health records (EHR) and life-critical patient monitoring integrations with strict HIPAA compliance.`
    : isSaaS
    ? `High-growth cloud SaaS delivering 99.99% availability for multi-tenant enterprise data platforms and API integrations.`
    : `${company.industry} organization committed to protecting customer trust, operational continuity, and business-critical digital infrastructure.`;

  const potentialBusinessRisks = isBanking
    ? [
        'Direct financial theft & fraudulent transaction diversion',
        'Large-scale financial & customer PII data exfiltration',
        'Severe core payment gateway downtime causing daily revenue forfeiture',
        'Regulatory sanctions and penalties from RBI / PCI-DSS oversight bodies',
        'Systemic brand degradation and depositor confidence erosion',
      ]
    : isHealth
    ? [
        'Protected Health Information (PHI) exposure & ransomware blackmail',
        'Clinical telemetry disruption affecting patient care delivery',
        'Severe HIPAA non-compliance statutory penalties',
        'Targeted extortion attacks locking electronic health record databases',
      ]
    : [
        'Unauthorized corporate database breach and confidential records leak',
        'Ransomware paralysis of business-critical service workflows',
        'Brand reputational damage and catastrophic customer churn',
        'Third-party supply chain and API compliance liability',
      ];

  const regulatoryExposure = isBanking
    ? ['RBI Cyber Security Framework', 'PCI-DSS v4.0.1', 'ISO/IEC 27001', 'DPDP Act (India) / GDPR']
    : isHealth
    ? ['HIPAA Security & Privacy Rule', 'HITECH Act', 'DISHA Act', 'ISO 27799']
    : isSaaS
    ? ['SOC 2 Type II', 'ISO/IEC 27001', 'GDPR', 'CCPA']
    : ['DPDP Act 2023', 'ISO 27001', 'Industry Best Practices'];

  const operationalDependencies = [
    `${company.keyServices[0] || 'Core Gateway'} relies on ${company.importantAssets[0] || 'Primary Database'} for real-time state`,
    `Public customer interactions depend upon high-availability ${company.importantAssets[2] || 'Authentication System'}`,
    `Employee operations rely on unified Single Sign-On and Cloud Infrastructure integrity`,
  ];

  return {
    businessTypeAndGoals,
    criticalAssets: company.importantAssets,
    criticalServices: company.keyServices,
    dataSensitivitySummary: company.dataSensitivity.join(' + '),
    potentialBusinessRisks,
    regulatoryExposure,
    operationalDependencies,
    aiModelUsed: 'Gemini 3.8 Intelligence Engine',
    generatedAt: new Date().toISOString(),
  };
}

export function generateBusinessPriorities(company: Company): BusinessPriority[] {
  const priorities: BusinessPriority[] = [];

  // Assets
  company.importantAssets.forEach((asset, idx) => {
    let priority: PriorityLevel = 'MEDIUM';
    let score = 0.6;
    let impact = 'Operational disruption and internal productivity loss.';

    const lower = asset.toLowerCase();
    if (lower.includes('payment') || lower.includes('database') || lower.includes('health') || lower.includes('classified')) {
      priority = 'VERY HIGH';
      score = 1.0;
      impact = 'Direct financial fraud, regulatory violation, and severe catastrophic breach.';
    } else if (lower.includes('auth') || lower.includes('cloud') || lower.includes('vault')) {
      priority = 'HIGH';
      score = 0.85;
      impact = 'Privilege compromise, lateral movement across infrastructure, and service disruption.';
    } else if (lower.includes('public') || lower.includes('website')) {
      priority = 'LOW';
      score = 0.4;
      impact = 'Defacement or temporary public-facing marketing unavailability.';
    }

    priorities.push({
      id: `priority-asset-${idx}`,
      name: asset,
      type: 'asset',
      priority,
      businessImpact: impact,
      criticalityScore: score,
    });
  });

  // Services
  company.keyServices.forEach((service, idx) => {
    let priority: PriorityLevel = 'MEDIUM';
    let score = 0.6;
    let impact = 'Degraded business workflow.';

    const lower = service.toLowerCase();
    if (lower.includes('payment') || lower.includes('core') || lower.includes('ehr')) {
      priority = 'VERY HIGH';
      score = 1.0;
      impact = 'Immediate stoppage of customer billing, core revenue, and transaction processing.';
    } else if (lower.includes('portal') || lower.includes('api')) {
      priority = 'HIGH';
      score = 0.8;
      impact = 'Customer friction, API partner failure, and escalated support backlogs.';
    } else if (lower.includes('website')) {
      priority = 'LOW';
      score = 0.35;
      impact = 'Low direct financial risk; limited to external marketing visibility.';
    }

    priorities.push({
      id: `priority-service-${idx}`,
      name: service,
      type: 'service',
      priority,
      businessImpact: impact,
      criticalityScore: score,
    });
  });

  return priorities;
}
