/**
 * Entity Type Correction Service
 *
 * Post-extraction classifier that prevents non-entity values from becoming
 * CDM PERSON or ORGANIZATION nodes.
 *
 * Common false-positive patterns (from CV and invoice testing):
 *   - Technical skills  → stored as PERSON ("JavaScript", "Python")
 *   - Job titles/roles  → stored as PERSON ("Senior Manager")
 *   - Certifications    → stored as PERSON ("BSc Computer Science")
 *   - Languages         → stored as ORGANIZATION ("English", "French")
 *   - Locations         → stored as ORGANIZATION ("Harare", "Zimbabwe")
 *   - Project names     → stored as PERSON ("NESARI Project")
 *
 * Design: vocabulary-first, deterministic, zero LLM calls.
 * LLM fallback is available as a separate async function for genuinely
 * ambiguous cases when aiClassifyEntityType is accessible.
 */

// ─── Decision type ────────────────────────────────────────────────────────────

export type CorrectionAction =
  | "keep"       // entity is a valid PERSON or ORGANIZATION
  | "skip"       // entity is not a CDM-worthy entity (skill, role, cert, etc.)
  | "quarantine" // ambiguous, send to human review

export interface EntityTypeDecision {
  action: CorrectionAction;
  entityType: "PERSON" | "ORGANIZATION";
  confidence: number;        // confidence in the classification
  reason: string;            // why this decision was made
  category_detected?: string; // e.g. "SKILL", "LOCATION", "ROLE", "CERT", "LANGUAGE"
}

// ─── Vocabulary sets ──────────────────────────────────────────────────────────

// Technical skills — do not create CDM entities for these
const SKILL_TOKENS = new Set([
  // Programming languages
  "javascript", "typescript", "python", "java", "php", "ruby", "golang", "go",
  "c", "c++", "c#", "rust", "swift", "kotlin", "scala", "perl", "r", "matlab",
  "html", "css", "sql", "nosql", "graphql", "xml", "json", "yaml",
  // Frameworks / libraries
  "react", "angular", "vue", "svelte", "nodejs", "express", "django", "flask",
  "spring", "laravel", "rails", "nextjs", "nuxtjs", "gatsby", "bootstrap",
  "tailwind", "jquery", "redux", "webpack",
  // Databases
  "mysql", "postgresql", "mongodb", "redis", "oracle", "mssql", "sqlite",
  "cassandra", "dynamodb", "elasticsearch", "firebase",
  // Cloud / devops
  "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "jenkins",
  "ansible", "puppet", "chef", "git", "github", "gitlab", "bitbucket",
  "linux", "unix", "windows", "macos",
  // MS Office / tools
  "excel", "word", "powerpoint", "outlook", "access", "sharepoint", "teams",
  "outlook", "visio", "project", "onenote", "infopath",
  // Design tools
  "photoshop", "illustrator", "indesign", "canva", "figma", "sketch",
  "autocad", "solidworks", "blender",
  // Business tools
  "jira", "confluence", "trello", "asana", "slack", "zoom", "salesforce",
  "sap", "pastel", "sage", "quickbooks", "xero", "accpac", "navision",
  // General skills (standalone single-token)
  "accounting", "auditing", "budgeting", "forecasting", "taxation",
  "bookkeeping", "payroll", "procurement", "logistics", "merchandising",
  "marketing", "seo", "copywriting", "editing", "proofreading",
  "photography", "videography", "cinematography",
  "welding", "plumbing", "carpentry", "masonry", "electrical",
  "first aid", "cpr",
  "driving", "forklift",
]);

// Multi-word skill phrases (checked after lowercasing full name)
const SKILL_PHRASES = [
  /^ms\s+(office|word|excel|access|project|powerpoint|outlook|teams|sharepoint)$/i,
  /^microsoft\s+(office|word|excel|access|project|powerpoint|outlook|teams|365)$/i,
  /^machine learning$/i, /^deep learning$/i, /^artificial intelligence$/i,
  /^data (science|analysis|analytics|engineering|mining|visuali[sz]ation)$/i,
  /^business (intelligence|analysis|analytics|development)$/i,
  /^project management$/i, /^time management$/i, /^change management$/i,
  /^risk (management|assessment|analysis)$/i,
  /^quality (assurance|control|management)$/i,
  /^supply chain (management)?$/i,
  /^customer (service|relations|care|support|experience)$/i,
  /^public (relations|speaking|administration)$/i,
  /^human resources?$/i,
  /^strategic (planning|management|thinking)$/i,
  /^financial (analysis|modelling|reporting|management|planning)$/i,
  /^network (administration|security|engineering)$/i,
  /^information (technology|security|systems? management)$/i,
  /^software (development|engineering|testing|architecture)$/i,
  /^web (development|design|programming)$/i,
  /^mobile (development|app development)$/i,
  /^database (administration|management|design)$/i,
  /^(good )?communication (skills?)?$/i,
  /^interpersonal (skills?)?$/i,
  /^(strong |excellent )?leadership (skills?)?$/i,
  /^problem.solving$/i,
  /^critical thinking$/i,
  /^(ms\s+)?power\s*(bi|point)$/i,
  /^tableau$/i,
];

// Job titles / roles — a standalone role is not a CDM entity
const ROLE_TOKENS = new Set([
  "manager", "director", "officer", "analyst", "coordinator", "supervisor",
  "administrator", "accountant", "auditor", "controller", "treasurer",
  "consultant", "advisor", "specialist", "technician", "engineer", "developer",
  "designer", "architect", "programmer", "scientist", "researcher",
  "professor", "lecturer", "teacher", "instructor", "trainer",
  "doctor", "nurse", "pharmacist", "dentist", "therapist", "counselor",
  "lawyer", "advocate", "attorney", "paralegal", "notary",
  "clerk", "secretary", "receptionist", "assistant", "associate",
  "intern", "apprentice", "trainee",
  "ceo", "coo", "cfo", "cto", "cio", "cmo", "chro",
  "md", "gm", "vp", "evp", "svp", "avp",
  "chairman", "chairperson", "president", "vice president",
  "head", "lead", "senior", "junior", "principal",
  "executive", "managing", "general",
  "cashier", "teller", "driver", "guard", "security",
  "operator", "technologist", "registrar",
]);

// Role phrases (multi-word job titles that should not become CDM entities)
const ROLE_PHRASES = [
  /^(chief|senior|junior|principal|lead|executive|managing|general)\s+\w+(\s+\w+)?$/i,
  /^\w+\s+(manager|director|officer|coordinator|specialist|analyst|administrator)$/i,
  /^\w+\s+\w+\s+(manager|director|officer|coordinator|specialist|analyst)$/i,
  /^(head of|director of|officer of|manager of)\s+.+$/i,
  /^(acting|interim|deputy|assistant|associate)\s+.+$/i,
];

// Known African + global locations (tokens)
const LOCATION_TOKENS = new Set([
  // African countries
  "zimbabwe", "zambia", "botswana", "mozambique", "malawi", "tanzania",
  "kenya", "uganda", "rwanda", "burundi", "ethiopia", "somalia", "eritrea",
  "ghana", "nigeria", "senegal", "cameroon", "ivory coast", "cote divoire",
  "angola", "namibia", "lesotho", "eswatini", "swaziland", "south africa",
  "egypt", "morocco", "algeria", "tunisia", "libya", "sudan",
  "madagascar", "mauritius", "seychelles", "comoros",
  // Major African cities
  "harare", "bulawayo", "mutare", "gweru", "masvingo", "kwekwe",
  "nairobi", "kampala", "dar es salaam", "kigali", "addis ababa",
  "lagos", "abuja", "accra", "kumasi", "dakar",
  "johannesburg", "cape town", "durban", "pretoria",
  "lusaka", "lilongwe", "gaborone", "maputo",
  "cairo", "casablanca", "tunis", "algiers",
  // Geographic descriptors
  "province", "district", "region", "county", "municipality",
  "city", "town", "village", "suburb", "ward",
  // Country code prefixes
  "north", "south", "east", "west", "central",
]);

// Certification and qualification patterns
const CERT_PHRASES = [
  /^(bsc|ba|bcom|btech|be|beng|bba|bfa|bed|bpharm|bvsc|barch)\b/i,
  /^(msc|ma|mcom|mba|meng|mphil|med|llb|llm|jd)\b/i,
  /^(phd|dphil|dba|dsc|edd|dlit|md)\b/i,
  /^(hnd|hnc|nc|nd|diploma in|certificate in|advanced certificate)\b/i,
  /^(cpa|ca|acca|cima|cfa|cia|cisa|cissp|pmp|prince2|itil|iso|six sigma)\b/i,
  /^(national certificate|national diploma|higher national|advanced certificate)\b/i,
  /^(cisco|comptia|microsoft certified|oracle certified|aws certified)\b/i,
  /^grade \d+$/i,
  /^(ordinary|advanced) level$/i,
  /^(o level|a level|o-level|a-level)s?$/i,
  /^(form \d+|form [ivxlcd]+)$/i,
  /^(gcse|gce|ib|igcse|sat|act)\b/i,
];

// Language names that could be confused for persons/orgs
const LANGUAGE_TOKENS = new Set([
  "english", "french", "portuguese", "arabic", "swahili", "hausa",
  "zulu", "xhosa", "shona", "ndebele", "chewa", "nyanja", "bemba",
  "tswana", "sotho", "venda", "tsonga", "pedi",
  "afrikaans", "amharic", "oromo", "igbo", "yoruba",
  "lingala", "kinyarwanda", "kirundi", "malagasy",
  "spanish", "german", "italian", "dutch", "russian", "chinese",
  "mandarin", "japanese", "korean", "hindi", "urdu",
]);

// Language phrases
const LANGUAGE_PHRASES = [
  /^(spoken|written|read|reading|speaking|writing|verbal)\s+\w+$/i,
  /^\w+\s+(language|fluency|proficiency|competence|competency)$/i,
  /^(mother tongue|native language|first language|second language)$/i,
  /^(fluent|basic|intermediate|advanced|proficient|conversational)\s+\w+$/i,
];

// ─── Core classification function ─────────────────────────────────────────────

/**
 * Classify an entity name to determine if it should be committed to CDM.
 *
 * @param displayName   The entity's display name (from extraction or raw entity list)
 * @param suggestedType The entity type suggested by the extraction layer
 * @param confidence    Extraction confidence for this entity
 * @param context       Optional additional context (canonical fields, field keys, etc.)
 */
export function classifyEntityForCdm(
  displayName: string,
  suggestedType: "PERSON" | "ORGANIZATION",
  confidence: number,
  context?: { fieldKeys?: string[]; docType?: string; rawText?: string }
): EntityTypeDecision {
  if (!displayName || displayName.trim().length < 2) {
    return { action: "skip", entityType: suggestedType, confidence: 0, reason: "Display name is too short or empty", category_detected: "EMPTY" };
  }

  const name = displayName.trim();
  const nameLower = name.toLowerCase();
  const tokens = nameLower.split(/[\s,.\-&/()+]+/).filter(Boolean);

  // ── 1. Single-token skill check ──────────────────────────────────────────────
  if (tokens.length === 1 && SKILL_TOKENS.has(tokens[0])) {
    return { action: "skip", entityType: suggestedType, confidence: 0.95, reason: `"${name}" is a known technical skill`, category_detected: "SKILL" };
  }

  // ── 2. Skill phrase check ─────────────────────────────────────────────────────
  for (const pattern of SKILL_PHRASES) {
    if (pattern.test(name)) {
      return { action: "skip", entityType: suggestedType, confidence: 0.90, reason: `"${name}" matches skill phrase pattern`, category_detected: "SKILL" };
    }
  }

  // ── 3. Language check ─────────────────────────────────────────────────────────
  if (tokens.length === 1 && LANGUAGE_TOKENS.has(tokens[0])) {
    return { action: "skip", entityType: suggestedType, confidence: 0.95, reason: `"${name}" is a known language`, category_detected: "LANGUAGE" };
  }
  for (const pattern of LANGUAGE_PHRASES) {
    if (pattern.test(name)) {
      return { action: "skip", entityType: suggestedType, confidence: 0.90, reason: `"${name}" matches language phrase pattern`, category_detected: "LANGUAGE" };
    }
  }

  // ── 4. Standalone role/title check (single token OR clear multi-word title) ──
  // Only skip when the ENTIRE name is a role, not when a person has a role in their name.
  // "Senior Manager" → skip; "Jane Smith, Senior Manager" → keep (comma-separated)
  if (tokens.length <= 3 && tokens.every(t => ROLE_TOKENS.has(t) || ["and", "of", "the", "or", "a", "an", "for"].includes(t))) {
    return { action: "skip", entityType: suggestedType, confidence: 0.88, reason: `"${name}" is a job title / role, not an entity`, category_detected: "ROLE" };
  }
  for (const pattern of ROLE_PHRASES) {
    // Only apply role phrase match if suggestedType is PERSON (roles shouldn't be persons)
    if (suggestedType === "PERSON" && pattern.test(name)) {
      return { action: "skip", entityType: suggestedType, confidence: 0.85, reason: `"${name}" matches job-title pattern`, category_detected: "ROLE" };
    }
  }

  // ── 5. Location check ─────────────────────────────────────────────────────────
  if (tokens.length <= 2 && tokens.every(t => LOCATION_TOKENS.has(t))) {
    return { action: "skip", entityType: suggestedType, confidence: 0.92, reason: `"${name}" is a location`, category_detected: "LOCATION" };
  }
  // Multi-token with a location descriptor token
  if (tokens.length <= 3 && tokens.some(t => ["province", "district", "region", "municipality", "city", "town", "village"].includes(t))) {
    return { action: "skip", entityType: suggestedType, confidence: 0.85, reason: `"${name}" contains a location descriptor`, category_detected: "LOCATION" };
  }

  // ── 6. Certification / qualification check ────────────────────────────────────
  for (const pattern of CERT_PHRASES) {
    if (pattern.test(name)) {
      return { action: "skip", entityType: suggestedType, confidence: 0.90, reason: `"${name}" is a qualification or certification`, category_detected: "CERTIFICATION" };
    }
  }

  // ── 7. Multi-token skill check (tokens all in skill set) ──────────────────────
  if (tokens.length >= 2 && tokens.length <= 4 && tokens.every(t => SKILL_TOKENS.has(t) || ["and", "or", "with", "using"].includes(t))) {
    return { action: "skip", entityType: suggestedType, confidence: 0.85, reason: `All tokens in "${name}" are known skills`, category_detected: "SKILL" };
  }

  // ── 8. Quarantine ambiguous short names on low confidence ─────────────────────
  if (tokens.length === 1 && confidence < 0.65) {
    return { action: "quarantine", entityType: suggestedType, confidence, reason: `Single-token entity "${name}" at low confidence — ambiguous; requires human review` };
  }

  // ── 9. Keep — passed all negative filters ────────────────────────────────────
  return { action: "keep", entityType: suggestedType, confidence, reason: "Passed all entity type correction filters" };
}

/**
 * Batch-classify a list of display names and return only the ones to keep.
 * Returns the kept names with their corrected type decision.
 */
export function filterEntitiesToKeep(
  entities: Array<{ displayName: string; entityType: "PERSON" | "ORGANIZATION"; confidence: number }>
): Array<{ displayName: string; entityType: "PERSON" | "ORGANIZATION"; confidence: number; decision: EntityTypeDecision }> {
  return entities
    .map(e => ({
      ...e,
      decision: classifyEntityForCdm(e.displayName, e.entityType, e.confidence),
    }))
    .filter(e => e.decision.action !== "skip");
}
