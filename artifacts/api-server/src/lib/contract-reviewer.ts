export interface ContractFinding {
  type: "missing_field" | "type_mismatch" | "backward_compat_risk" | "schema_suggestion";
  field: string;
  severity: "low" | "medium" | "high";
  description: string;
  suggestion: string;
}

export interface ContractReview {
  findings: ContractFinding[];
  overallRisk: "low" | "medium" | "high" | "critical";
  summary: string;
  suggestedSchema: string | null;
}

function safeParseJson(str: string): { success: true; data: unknown } | { success: false; error: string } {
  try {
    const data = JSON.parse(str);
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

function getType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function analyzeSchema(
  obj: Record<string, unknown>,
  prefix: string,
  findings: ContractFinding[]
): void {
  for (const [key, value] of Object.entries(obj)) {
    const field = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      findings.push({
        type: "missing_field",
        field,
        severity: "medium",
        description: `Field "${field}" is null or undefined — unclear if intentionally nullable or missing data`,
        suggestion: `Make nullability explicit: use "nullable: true" in OpenAPI schema or wrap as Optional<T> in TypeScript`,
      });
    }

    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      if (Object.keys(nested).length === 0) {
        findings.push({
          type: "schema_suggestion",
          field,
          severity: "low",
          description: `Field "${field}" is an empty object — may indicate placeholder data or missing properties`,
          suggestion: `Define the expected structure for "${field}" with explicit properties in the schema`,
        });
      } else {
        analyzeSchema(nested, field, findings);
      }
    }

    if (Array.isArray(value) && value.length === 0) {
      findings.push({
        type: "schema_suggestion",
        field,
        severity: "low",
        description: `Array field "${field}" is empty — cannot infer item schema from contract`,
        suggestion: `Include at least one example item in "${field}" for complete schema inference`,
      });
    }

    if (typeof value === "string") {
      if (key.toLowerCase().includes("id") && !/^\d+$/.test(value) && !/^[0-9a-f-]{36}$/i.test(value)) {
        findings.push({
          type: "schema_suggestion",
          field,
          severity: "low",
          description: `Field "${field}" appears to be an identifier but uses a non-standard format: "${value}"`,
          suggestion: `Standardize ID format to UUID v4 or sequential integer for consistency and indexing efficiency`,
        });
      }
      if (key.toLowerCase().includes("date") || key.toLowerCase().includes("at") || key.toLowerCase().includes("time")) {
        if (!value.match(/^\d{4}-\d{2}-\d{2}/)) {
          findings.push({
            type: "type_mismatch",
            field,
            severity: "medium",
            description: `Field "${field}" appears to be a date/time but is not in ISO 8601 format: "${value}"`,
            suggestion: `Use ISO 8601 format (e.g., "2025-04-28T14:23:11Z") for all date/time fields`,
          });
        }
      }
    }
  }
}

function detectTypeMismatches(
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  findings: ContractFinding[]
): void {
  for (const key of Object.keys(req)) {
    if (key in res) {
      const reqType = getType(req[key]);
      const resType = getType(res[key]);
      if (reqType !== resType && reqType !== "null" && resType !== "null") {
        findings.push({
          type: "type_mismatch",
          field: key,
          severity: "high",
          description: `Field "${key}" is type "${reqType}" in request but "${resType}" in response — type inconsistency`,
          suggestion: `Align the type of "${key}" across request and response schemas. Use a shared type definition if both represent the same concept.`,
        });
      }
    }
  }
}

function detectBackwardCompatRisks(
  res: Record<string, unknown>,
  findings: ContractFinding[]
): void {
  const dangerousPatterns = ["version", "schema", "type", "format", "kind", "status"];
  for (const key of Object.keys(res)) {
    if (dangerousPatterns.includes(key.toLowerCase())) {
      findings.push({
        type: "backward_compat_risk",
        field: key,
        severity: "medium",
        description: `Field "${key}" is a discriminator/versioning field — changes to this field are frequently breaking`,
        suggestion: `Add backward-compatibility guarantees for "${key}". If changing, bump the API version and maintain old value for a deprecation period.`,
      });
    }
    if (typeof res[key] === "object" && !Array.isArray(res[key]) && res[key] !== null) {
      findings.push({
        type: "backward_compat_risk",
        field: key,
        severity: "medium",
        description: `Field "${key}" is a nested object — adding required properties to objects is a breaking change`,
        suggestion: `All new properties in "${key}" should be optional. Use additive-only schema evolution.`,
      });
    }
  }
}

function computeOverallRisk(findings: ContractFinding[]): "low" | "medium" | "high" | "critical" {
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;
  if (highCount >= 3) return "critical";
  if (highCount >= 1) return "high";
  if (medCount >= 2) return "medium";
  return "low";
}

export function reviewContract(params: {
  requestJson: string;
  responseJson: string;
  serviceName?: string | null;
  version?: string | null;
}): ContractReview {
  const findings: ContractFinding[] = [];
  const name = params.serviceName ?? "Unknown Service";

  const reqParsed = safeParseJson(params.requestJson);
  const resParsed = safeParseJson(params.responseJson);

  if (!reqParsed.success) {
    findings.push({
      type: "schema_suggestion",
      field: "request",
      severity: "high",
      description: `Request JSON is not valid JSON: ${reqParsed.error}`,
      suggestion: "Fix JSON syntax errors in the request body before proceeding with contract analysis",
    });
  }

  if (!resParsed.success) {
    findings.push({
      type: "schema_suggestion",
      field: "response",
      severity: "high",
      description: `Response JSON is not valid JSON: ${resParsed.error}`,
      suggestion: "Fix JSON syntax errors in the response body before proceeding with contract analysis",
    });
  }

  if (reqParsed.success && resParsed.success) {
    const req = reqParsed.data as Record<string, unknown>;
    const res = resParsed.data as Record<string, unknown>;

    analyzeSchema(req, "request", findings);
    analyzeSchema(res, "response", findings);
    detectTypeMismatches(req, res, findings);
    detectBackwardCompatRisks(res, findings);

    if (!("id" in res) && !("ids" in res)) {
      findings.push({
        type: "missing_field",
        field: "response.id",
        severity: "medium",
        description: "Response does not include an `id` field — difficult to reference or cache returned resources",
        suggestion: "Include a stable `id` (UUID or integer) in all resource responses for caching, deduplication, and client-side reference",
      });
    }
    if (!("createdAt" in res) && !("updatedAt" in res) && !("timestamp" in res)) {
      findings.push({
        type: "schema_suggestion",
        field: "response.timestamps",
        severity: "low",
        description: "Response lacks timestamp fields (createdAt / updatedAt) — difficult to implement time-based caching or audit trails",
        suggestion: "Add ISO 8601 timestamp fields to track resource lifecycle",
      });
    }
  }

  const overallRisk = computeOverallRisk(findings);
  const highCount = findings.filter((f) => f.severity === "high").length;
  const medCount = findings.filter((f) => f.severity === "medium").length;

  const summary =
    findings.length === 0
      ? `No contract issues detected for ${name}. The API contract appears well-formed.`
      : `Found ${findings.length} contract issue(s) for ${name}: ${highCount} high severity, ${medCount} medium severity. ${overallRisk === "critical" || overallRisk === "high" ? "Immediate action recommended before deployment." : "Review and address before next release."}`;

  return {
    findings,
    overallRisk,
    summary,
    suggestedSchema: null,
  };
}
