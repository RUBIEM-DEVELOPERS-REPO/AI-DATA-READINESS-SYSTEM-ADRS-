export interface EntityTarget {
  entityType: string;
  expectedFields: string[];
  normalizationRules: Record<string, "string" | "number" | "date" | "phone" | "email">;
}

export interface ExtractionProfile {
  id: string;
  name: string;
  description: string;
  semanticDescription: string; // Used for vector-based zero-shot profile matching
  documentFamilies: string[]; // e.g. ["INVOICE", "RECEIPT"]
  targetEntities: EntityTarget[];
  relevanceWeights: Record<string, number>; // Field key -> weight multiplier
}

// 1. Generic Profile
export const GenericProfile: ExtractionProfile = {
  id: "profile-generic",
  name: "Generic Document",
  description: "Fallback profile for unclassified documents",
  semanticDescription: "A general-purpose document without specific financial or employment structure. This includes correspondence, memos, plain text letters, generic forms, partnership agreements, deeds, and legal policies. It primarily contains generic named entities like persons and organizations without highly structured line items or numerical transactions.",
  documentFamilies: ["OTHER", "CORRESPONDENCE", "MEMORANDUM", "FORM", "POLICY", "AGREEMENT", "CONTRACT", "DEED", "LEASE"],
  targetEntities: [
    {
      entityType: "PERSON",
      expectedFields: ["name", "email", "phone"],
      normalizationRules: {
        email: "email",
        phone: "phone",
      }
    },
    {
      entityType: "ORGANIZATION",
      expectedFields: ["name", "registration_number"],
      normalizationRules: {}
    }
  ],
  relevanceWeights: {
    "name": 1.0,
    "email": 1.0
  }
};

// 2. Financial Profile
export const FinancialProfile: ExtractionProfile = {
  id: "profile-finance",
  name: "Financial Record",
  description: "Profile for invoices, receipts, and POs",
  semanticDescription: "A financial or transactional document involving the exchange of money, goods, or services. This includes invoices, tax receipts, purchase orders, bank statements, quotations, and balance sheets. It is characterized by monetary amounts, currency codes, tax registration numbers, seller and buyer details, bank account numbers, and itemized transaction lines.",
  documentFamilies: ["INVOICE", "QUOTATION", "PURCHASE_ORDER", "RECEIPT", "BANK_STATEMENT", "FINANCIAL", "REPORT"],
  targetEntities: [
    {
      entityType: "ORGANIZATION",
      expectedFields: ["name", "registration_number", "tax_number", "bank_account"],
      normalizationRules: {}
    },
    {
      entityType: "TRANSACTION",
      expectedFields: ["amount", "date", "currency", "invoice_number"],
      normalizationRules: {
        amount: "number",
        date: "date"
      }
    }
  ],
  relevanceWeights: {
    "amount": 1.5,
    "tax_number": 1.2,
    "invoice_number": 1.5,
    "bank_account": 1.5
  }
};

// 3. HR / Employment Profile
export const HRProfile: ExtractionProfile = {
  id: "profile-hr",
  name: "HR & Employment",
  description: "Profile for CVs, payslips, and identity documents",
  semanticDescription: "A human resources, employment, or identification document representing an individual's personal or professional details. This includes curriculum vitae (CVs), resumes, payslips, national ID cards, passports, academic certificates, driving licenses, and work permits. It typically contains personal identifiers, dates of birth, skill sets, job titles, employment durations, and contact information.",
  documentFamilies: ["CV", "IDENTITY", "PAYSLIP", "CERTIFICATE", "LICENSE", "PERMIT"],
  targetEntities: [
    {
      entityType: "PERSON",
      expectedFields: ["name", "email", "phone", "national_id"],
      normalizationRules: {
        email: "email",
        phone: "phone",
        date_of_birth: "date"
      }
    },
    {
      entityType: "SKILL",
      expectedFields: ["name", "proficiency"],
      normalizationRules: {}
    },
    {
      entityType: "ROLE",
      expectedFields: ["title", "company", "duration"],
      normalizationRules: {}
    }
  ],
  relevanceWeights: {
    "national_id": 2.0,
    "email": 1.5,
    "phone": 1.2,
    "skill": 1.0
  }
};

export const ExtractionProfiles: ExtractionProfile[] = [
  GenericProfile,
  FinancialProfile,
  HRProfile
];

export function getProfileForDocType(docType: string): ExtractionProfile {
  const profile = ExtractionProfiles.find(p => p.documentFamilies.includes(docType));
  return profile || GenericProfile;
}
