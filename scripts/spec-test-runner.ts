/**
 * Spec-Based Test Runner
 *
 * 读取 .spec.yaml 文件并自动执行测试用例
 *
 * Usage:
 *   pnpm tsx scripts/spec-test-runner.ts --module auth
 *   pnpm tsx scripts/spec-test-runner.ts --all
 *   pnpm tsx scripts/spec-test-runner.ts --approved
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { parse } from 'yaml';

// ============================================================
// Types
// ============================================================

interface Spec {
  module: string;
  version: string;
  status: 'pending_review' | 'approved' | 'testing' | 'passed' | 'failed';
  description: string;
  human_review: Array<{ item: string; confirmed: boolean }>;
  test_cases: TestCase[];
  cleanup?: CleanupAction[];
}

interface TestCase {
  id: string;
  name: string;
  type: 'api' | 'trpc' | 'db_query' | 'script';
  depends_on?: string[];
  setup?: SetupAction[];
  method?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  script?: string;
  // tRPC specific
  procedure?: string;
  input?: unknown;
  trpc_type?: 'query' | 'mutation'; // Default: infer from procedure name
  expect: ExpectConfig;
  variables?: Record<string, string>;
}

interface ExpectConfig {
  status?: number;
  json?: JsonAssertion[];
  result?: JsonAssertion[];
  success?: boolean;
  error?: { code: string };
}

interface JsonAssertion {
  path: string;
  exists?: boolean;
  equals?: unknown;
  contains?: string;
  not_contains?: string;
  not_equals?: unknown;
  matches?: string;
  all_equal?: unknown;
  is_empty?: boolean;
}

interface SetupAction {
  login_as?: string;
  clear_auth?: boolean;
}

interface CleanupAction {
  delete_user?: string;
  delete_content?: string;
  delete_setting?: { scope: string; key: string; org?: string };
  delete_schema?: { keyPattern: string };
}

interface TestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  assertions?: AssertionResult[];
}

interface AssertionResult {
  path: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

interface SpecResult {
  module: string;
  status: 'passed' | 'failed' | 'partial';
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  results: TestResult[];
  timestamp: string;
}

// ============================================================
// Configuration
// ============================================================

const SPECS_DIR = join(__dirname, '../openspec/changes/project-completion-assessment-and-roadmap/specs');
const RESULTS_DIR = join(__dirname, '../openspec/changes/project-completion-assessment-and-roadmap/test-results');
const BASE_URL = process.env.TEST_BASE_URL || process.env.API_URL || 'http://localhost:3000';

// Test accounts (match seed-test-accounts.ts or auto-created)
const TEST_PASSWORD = 'Test123456';
const TEST_ACCOUNTS: Record<string, { email: string; password: string; name: string }> = {
  admin: { email: 'owner@wordrhyme.test', password: TEST_PASSWORD, name: 'Admin' },
  admin_tenant_a: { email: 'admin-a@wordrhyme.test', password: TEST_PASSWORD, name: 'Admin Tenant A' },
  admin_tenant_b: { email: 'admin-b@wordrhyme.test', password: TEST_PASSWORD, name: 'Admin Tenant B' },
  user: { email: 'member@wordrhyme.test', password: TEST_PASSWORD, name: 'Regular User' },
};

// Track created accounts to avoid duplicates
const createdAccounts = new Set<string>();

async function ensureTestAccount(account: string): Promise<void> {
  if (createdAccounts.has(account)) return;

  const creds = TEST_ACCOUNTS[account];
  if (!creds) return;

  try {
    // Try to create the account
    const signUpResponse = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: creds.name,
        email: creds.email,
        password: creds.password,
      }),
    });

    if (signUpResponse.ok) {
      console.log(`    [SETUP] Created test account: ${account}`);
    }
    // 422 means already exists, which is fine
    createdAccounts.add(account);
  } catch {
    // Ignore errors - will fail on login if account doesn't exist
  }
}

// ============================================================
// Variable Store
// ============================================================

class VariableStore {
  private vars: Record<string, unknown> = {};

  set(key: string, value: unknown) {
    this.vars[key] = value;
  }

  get(key: string): unknown {
    return this.vars[key];
  }

  interpolate(text: string): string {
    return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      if (key === '$timestamp') return Date.now().toString();
      if (key === '$uuid') return crypto.randomUUID();
      const value = this.get(key.trim());
      return value !== undefined ? String(value) : `{{${key}}}`;
    });
  }

  interpolateObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.interpolate(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.interpolateObject(item));
    }
    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.interpolateObject(value);
      }
      return result;
    }
    return obj;
  }
}

// ============================================================
// API Client
// ============================================================

class ApiClient {
  private token: string | null = null;
  private cookies: string | null = null;

  async login(account: string): Promise<void> {
    const creds = TEST_ACCOUNTS[account];
    if (!creds) throw new Error(`Unknown account: ${account}`);

    // Ensure account exists
    await ensureTestAccount(account);

    const response = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed for ${account}: ${response.status}`);
    }

    // Get cookies for session-based auth
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      // Parse set-cookie header to extract just the cookie name=value part
      // set-cookie format: "name=value; Max-Age=...; Path=/; ..."
      const cookies = setCookie.split(',').map(c => {
        const parts = c.trim().split(';');
        return parts[0]; // Get just the name=value part
      });
      this.cookies = cookies.join('; ');
    }

    const data = await response.json() as { session?: { token?: string }; token?: string };
    this.token = data.session?.token || data.token || null;
  }

  async request(method: string, endpoint: string, options: {
    headers?: Record<string, string>;
    body?: unknown;
    query?: Record<string, string>;
  } = {}): Promise<{ status: number; data: unknown }> {
    let url = `${BASE_URL}${endpoint}`;

    if (options.query) {
      const params = new URLSearchParams(options.query);
      url += `?${params}`;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.cookies && !headers['Cookie']) {
      headers['Cookie'] = this.cookies;
      // Add Origin header for CSRF protection when using cookies
      if (!headers['Origin']) {
        headers['Origin'] = BASE_URL;
      }
    }

    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Extract cookies from response (for session-based auth)
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const cookies = setCookie.split(',').map(c => {
        const parts = c.trim().split(';');
        return parts[0];
      });
      this.cookies = cookies.join('; ');
    }

    let data: unknown;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return { status: response.status, data };
  }

  clearToken() {
    this.token = null;
    this.cookies = null;
  }
}

// ============================================================
// JSON Path Evaluator (simplified)
// ============================================================

function evaluateJsonPath(data: unknown, path: string): unknown {
  // Simple implementation - for production use jsonpath-plus
  // Handle root path '$' - return the entire data
  if (path === '$') {
    return data;
  }

  const parts = path.replace(/^\$\.?/, '').split('.');
  let current: unknown = data;

  for (const part of parts) {
    // Skip empty parts (e.g., from "$.foo" -> ["", "foo"] after split)
    if (!part) continue;

    if (current === null || current === undefined) return undefined;

    // Handle array index
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = (current as Record<string, unknown>)[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      }
      continue;
    }

    // Handle wildcard
    if (part === '*' && Array.isArray(current)) {
      // Return all elements
      return current;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ============================================================
// Assertion Checker
// ============================================================

function checkAssertion(data: unknown, assertion: JsonAssertion, vars: VariableStore): AssertionResult {
  const actual = evaluateJsonPath(data, assertion.path);
  let expected: unknown;
  let passed = false;

  if ('exists' in assertion) {
    expected = assertion.exists;
    passed = assertion.exists ? actual !== undefined : actual === undefined;
  } else if ('equals' in assertion) {
    // Handle null and boolean values directly, only interpolate strings
    if (assertion.equals === null || typeof assertion.equals === 'boolean' || typeof assertion.equals === 'number') {
      expected = assertion.equals;
    } else {
      expected = vars.interpolate(String(assertion.equals));
    }
    passed = actual === expected;
  } else if ('contains' in assertion) {
    expected = assertion.contains;
    passed = typeof actual === 'string' && actual.includes(assertion.contains!);
  } else if ('not_contains' in assertion) {
    expected = `not contains: ${assertion.not_contains}`;
    passed = typeof actual === 'string' && !actual.includes(assertion.not_contains!);
  } else if ('not_equals' in assertion) {
    expected = `not: ${assertion.not_equals}`;
    passed = actual !== assertion.not_equals;
  } else if ('matches' in assertion) {
    expected = assertion.matches;
    passed = typeof actual === 'string' && new RegExp(assertion.matches!).test(actual);
  } else if ('all_equal' in assertion) {
    expected = assertion.all_equal;
    passed = Array.isArray(actual) && actual.every(item => item === assertion.all_equal);
  } else if ('is_empty' in assertion) {
    expected = 'empty';
    passed = Array.isArray(actual) ? actual.length === 0 : !actual;
  }

  return { path: assertion.path, expected, actual, passed };
}

// ============================================================
// Test Runner
// ============================================================

async function runTestCase(
  testCase: TestCase,
  api: ApiClient,
  vars: VariableStore
): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    id: testCase.id,
    name: testCase.name,
    status: 'passed',
    duration: 0,
    assertions: [],
  };

  try {
    // Setup
    if (testCase.setup) {
      for (const action of testCase.setup) {
        if (action.clear_auth) {
          api.clearToken();
        }
        if (action.login_as) {
          await api.login(action.login_as);
        }
      }
    }

    // Execute based on type
    if (testCase.type === 'api') {
      const endpoint = vars.interpolate(testCase.endpoint!);
      const body = testCase.body ? vars.interpolateObject(testCase.body) : undefined;
      const headers = testCase.headers
        ? Object.fromEntries(
            Object.entries(testCase.headers).map(([k, v]) => [k, vars.interpolate(v)])
          )
        : undefined;

      const response = await api.request(testCase.method!, endpoint, {
        headers,
        body,
        query: testCase.query,
      });

      // Check status
      if (testCase.expect.status && response.status !== testCase.expect.status) {
        result.status = 'failed';
        result.error = `Expected status ${testCase.expect.status}, got ${response.status}`;
      }

      // Check JSON assertions
      if (testCase.expect.json) {
        for (const assertion of testCase.expect.json) {
          const assertionResult = checkAssertion(response.data, assertion, vars);
          result.assertions!.push(assertionResult);
          if (!assertionResult.passed) {
            result.status = 'failed';
          }
        }
      }

      // Extract variables
      if (testCase.variables && result.status === 'passed') {
        for (const [name, path] of Object.entries(testCase.variables)) {
          const value = evaluateJsonPath(response.data, path);
          vars.set(name, value);
        }
      }
    } else if (testCase.type === 'trpc') {
      // tRPC test
      const procedure = vars.interpolate(testCase.procedure!);
      const input = testCase.input ? vars.interpolateObject(testCase.input) : {};
      const headers = testCase.headers
        ? Object.fromEntries(
            Object.entries(testCase.headers).map(([k, v]) => [k, vars.interpolate(v)])
          )
        : undefined;

      // Determine if query or mutation
      // Mutation keywords: create, update, delete, set, add, remove, toggle, revoke
      const mutationKeywords = ['create', 'update', 'delete', 'set', 'add', 'remove', 'toggle', 'revoke', 'setActive', 'signOut', 'signIn', 'signUp'];
      const procedureName = procedure.split('.').pop() || '';
      const isMutation = testCase.trpc_type === 'mutation' ||
        (testCase.trpc_type !== 'query' && mutationKeywords.some(kw => procedureName.toLowerCase().startsWith(kw.toLowerCase())));

      // Call tRPC endpoint (tRPC uses /trpc/ not /api/trpc/)
      let response;
      if (isMutation) {
        response = await api.request('POST', `/trpc/${procedure}`, {
          headers,
          body: input,
        });
      } else {
        // Query: use GET with input as query param
        const inputStr = encodeURIComponent(JSON.stringify(input));
        response = await api.request('GET', `/trpc/${procedure}?input=${inputStr}`, {
          headers,
        });
      }

      // Parse tRPC response
      const trpcData = response.data as { result?: { data?: unknown }; error?: { data?: { code?: string }; code?: string } };
      const isSuccess = !trpcData.error;
      const resultData = trpcData.result?.data ?? trpcData.result ?? response.data;

      // Check success expectation
      if ('success' in testCase.expect) {
        if (testCase.expect.success !== isSuccess) {
          result.status = 'failed';
          result.error = `Expected success=${testCase.expect.success}, got ${isSuccess}`;
        }
      }

      // Check error code
      if (testCase.expect.error) {
        const errorCode = trpcData.error?.data?.code || trpcData.error?.code;
        if (errorCode !== testCase.expect.error.code) {
          result.status = 'failed';
          result.error = `Expected error code ${testCase.expect.error.code}, got ${errorCode}`;
        }
      }

      // Check result assertions
      if (testCase.expect.result) {
        for (const assertion of testCase.expect.result) {
          const assertionResult = checkAssertion(resultData, assertion, vars);
          result.assertions!.push(assertionResult);
          if (!assertionResult.passed) {
            result.status = 'failed';
          }
        }
      }

      // Extract variables
      if (testCase.variables && result.status === 'passed') {
        for (const [name, path] of Object.entries(testCase.variables)) {
          const value = evaluateJsonPath(resultData, path);
          vars.set(name, value);
        }
      }
    } else if (testCase.type === 'script') {
      // Script execution would require eval or a sandbox
      // For now, mark as skipped
      result.status = 'skipped';
      result.error = 'Script execution not implemented';
    } else if (testCase.type === 'db_query') {
      // DB query would require database connection
      result.status = 'skipped';
      result.error = 'DB query execution not implemented';
    }
  } catch (error) {
    result.status = 'failed';
    result.error = error instanceof Error ? error.message : String(error);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function runSpec(spec: Spec): Promise<SpecResult> {
  const api = new ApiClient();
  const vars = new VariableStore();
  const results: TestResult[] = [];

  // Check if approved
  const allConfirmed = spec.human_review.every(item => item.confirmed);
  if (!allConfirmed && spec.status === 'pending_review') {
    console.log(`⚠️  Spec ${spec.module} has unconfirmed review items`);
  }

  // Build dependency graph
  const completed = new Set<string>();

  for (const testCase of spec.test_cases) {
    // Check dependencies
    if (testCase.depends_on) {
      const unmet = testCase.depends_on.filter(dep => !completed.has(dep));
      if (unmet.length > 0) {
        results.push({
          id: testCase.id,
          name: testCase.name,
          status: 'skipped',
          duration: 0,
          error: `Unmet dependencies: ${unmet.join(', ')}`,
        });
        continue;
      }
    }

    console.log(`  Running ${testCase.id}: ${testCase.name}...`);
    const result = await runTestCase(testCase, api, vars);
    results.push(result);

    if (result.status === 'passed') {
      completed.add(testCase.id);
      console.log(`    ✅ Passed (${result.duration}ms)`);
    } else if (result.status === 'failed') {
      console.log(`    ❌ Failed: ${result.error}`);
    } else {
      console.log(`    ⏭️  Skipped: ${result.error}`);
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };

  return {
    module: spec.module,
    status: summary.failed === 0 ? (summary.skipped > 0 ? 'partial' : 'passed') : 'failed',
    summary,
    results,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // Ensure results directory exists
  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  // Find spec files
  const specFiles = readdirSync(SPECS_DIR).filter(f => f.endsWith('.spec.yaml'));

  if (args.includes('--list')) {
    console.log('\n📋 Available Specs:\n');
    for (const file of specFiles) {
      const content = readFileSync(join(SPECS_DIR, file), 'utf-8');
      const spec = parse(content) as Spec;
      const confirmed = spec.human_review.filter(i => i.confirmed).length;
      const total = spec.human_review.length;
      console.log(`  ${spec.module.padEnd(15)} ${spec.status.padEnd(15)} [${confirmed}/${total} confirmed]`);
    }
    return;
  }

  // Determine which specs to run
  let toRun: string[] = [];

  if (args.includes('--all')) {
    toRun = specFiles;
  } else if (args.includes('--approved')) {
    for (const file of specFiles) {
      const content = readFileSync(join(SPECS_DIR, file), 'utf-8');
      const spec = parse(content) as Spec;
      if (spec.status === 'approved' || spec.human_review.every(i => i.confirmed)) {
        toRun.push(file);
      }
    }
  } else {
    const moduleIndex = args.indexOf('--module');
    if (moduleIndex !== -1 && args[moduleIndex + 1]) {
      const moduleName = args[moduleIndex + 1];
      const file = specFiles.find(f => f.startsWith(moduleName));
      if (file) toRun.push(file);
    }
  }

  if (toRun.length === 0) {
    console.log('No specs to run. Use --module <name>, --all, or --approved');
    return;
  }

  console.log('\n🧪 Running Spec Tests\n');

  for (const file of toRun) {
    console.log(`\n📦 ${basename(file, '.spec.yaml')}`);
    console.log('─'.repeat(40));

    const content = readFileSync(join(SPECS_DIR, file), 'utf-8');
    const spec = parse(content) as Spec;
    const result = await runSpec(spec);

    // Save result
    const resultFile = join(RESULTS_DIR, `${spec.module}.result.json`);
    writeFileSync(resultFile, JSON.stringify(result, null, 2));

    // Summary
    console.log('─'.repeat(40));
    console.log(
      `  Total: ${result.summary.total} | ` +
      `✅ ${result.summary.passed} | ` +
      `❌ ${result.summary.failed} | ` +
      `⏭️  ${result.summary.skipped}`
    );
  }

  console.log('\n✨ Done!\n');
}

main().catch(console.error);
