const BASE = "/api";

export interface BackendIntegration {
  name: string;
  status: "not-connected" | "demo" | "connected" | "failed";
  fields: Record<string, string>;
  boolFields: Record<string, boolean>;
  testedAt: string | null;
  savedAt: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
  latencyMs: number | null;
  status: "connected" | "failed";
}

export interface SaveResult {
  ok: boolean;
  name: string;
  status: string;
}

export async function fetchIntegrations(): Promise<BackendIntegration[]> {
  const res = await fetch(`${BASE}/integrations`);
  if (!res.ok) throw new Error(`Failed to fetch integrations: ${res.status}`);
  return res.json() as Promise<BackendIntegration[]>;
}

export async function saveIntegration(payload: {
  name: string;
  fields: Record<string, string>;
  boolFields: Record<string, boolean>;
}): Promise<SaveResult> {
  const res = await fetch(`${BASE}/integrations/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? `Save failed: ${res.status}`);
  }
  return res.json() as Promise<SaveResult>;
}

export async function testIntegration(payload: {
  name: string;
  fields: Record<string, string>;
  boolFields: Record<string, boolean>;
}): Promise<TestResult> {
  const res = await fetch(`${BASE}/integrations/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json() as { error?: string };
    throw new Error(err.error ?? `Test failed: ${res.status}`);
  }
  return res.json() as Promise<TestResult>;
}
