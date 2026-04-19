/**
 * BinaryLane API Client
 *
 * HTTP client with retry logic, rate limiting, and all 56 API methods.
 * In code mode, this is exposed as `bl` inside the sandbox.
 */

import type {
  PaginationParams, LinksResponse, MetaResponse,
  Account, Balance, Invoice, Server, CreateServerRequest, ServerAction, Action, ActionLink,
  Backup, AdvancedFirewallRule, ConsoleInfo, DataUsage,
  Kernel, AdvancedServerFeature, ThresholdAlert, CurrentServerAlert,
  LicensedSoftware, SampleSet, UploadImageRequest,
  Image, UpdateImageRequest,
  SshKey, CreateSshKeyRequest, UpdateSshKeyRequest,
  Domain, CreateDomainRequest, DomainRecord, CreateDomainRecordRequest, UpdateDomainRecordRequest,
  Nameserver, ReverseName,
  Vpc, CreateVpcRequest, UpdateVpcRequest, VpcMember,
  LoadBalancer, CreateLoadBalancerRequest, UpdateLoadBalancerRequest, ForwardingRule,
  LoadBalancerAvailability,
  Region, Size, Software,
} from './types.js';

export { ApiError };

const BASE_URL = 'https://api.binarylane.com.au/v2';

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

interface ApiErrorResponse {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export interface RateLimitConfig {
  maxConcurrent?: number;
  retryConfig?: RetryConfig;
}

export class BinaryLaneClient {
  private apiToken: string;
  private maxConcurrent: number;
  private retryConfig: Required<RetryConfig>;
  private activeRequests: number = 0;
  private requestQueue: Array<() => void> = [];

  constructor(apiToken: string, config?: RateLimitConfig) {
    this.apiToken = apiToken;
    this.maxConcurrent = config?.maxConcurrent ?? 5;
    this.retryConfig = {
      maxRetries: config?.retryConfig?.maxRetries ?? 3,
      baseDelay: config?.retryConfig?.baseDelay ?? 1000,
      maxDelay: config?.retryConfig?.maxDelay ?? 32000,
      backoffMultiplier: config?.retryConfig?.backoffMultiplier ?? 2,
    };
  }

  private async waitForSlot(): Promise<void> {
    if (this.activeRequests < this.maxConcurrent) {
      this.activeRequests++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.requestQueue.push(() => {
        this.activeRequests++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.activeRequests--;
    const next = this.requestQueue.shift();
    if (next) next();
  }

  private shouldRetry(statusCode: number): boolean {
    return statusCode === 429 || statusCode === 502 || statusCode === 503 || statusCode === 504;
  }

  private calculateDelay(attempt: number, retryAfter?: number): number {
    if (retryAfter !== undefined) return retryAfter * 1000;
    const { baseDelay, backoffMultiplier, maxDelay } = this.retryConfig;
    const exponentialDelay = baseDelay * Math.pow(backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, maxDelay);
    const jitter = cappedDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(0, cappedDelay + jitter);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    queryParams?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    await this.waitForSlot();

    try {
      let url = `${BASE_URL}${path}`;

      if (queryParams) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;
      }

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      };

      const options: RequestInit = { method, headers };

      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
        options.body = JSON.stringify(body);
      }

      let lastError: ApiError | Error | undefined;

      for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
        try {
          const response = await fetch(url, options);

          if (response.status === 204) return {} as T;

          const text = await response.text();
          if (!text) return {} as T;
          const data = JSON.parse(text);

          if (!response.ok) {
            const error = data as ApiErrorResponse;
            const apiError = new ApiError(
              error.detail || error.title || `API error: ${response.status}`,
              response.status,
              error
            );

            if (attempt < this.retryConfig.maxRetries && this.shouldRetry(response.status)) {
              lastError = apiError;
              const retryAfter = response.headers.get('Retry-After');
              const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
              const delay = this.calculateDelay(attempt, retryAfterSeconds);
              await this.sleep(delay);
              continue;
            }

            throw apiError;
          }

          return data as T;
        } catch (error) {
          if (error instanceof ApiError) throw error;

          if (attempt < this.retryConfig.maxRetries) {
            lastError = error as Error;
            const delay = this.calculateDelay(attempt);
            await this.sleep(delay);
            continue;
          }

          throw error;
        }
      }

      throw lastError || new Error('Request failed after all retry attempts');
    } finally {
      this.releaseSlot();
    }
  }

  // ==================== Account ====================

  async getAccount() {
    return this.request<{ account: Account }>('GET', '/account');
  }

  async getBalance() {
    return this.request<{ balance: Balance }>('GET', '/customers/my/balance');
  }

  async getInvoices(params?: PaginationParams) {
    return this.request<{ invoices: Invoice[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/customers/my/invoices', undefined, params as Record<string, string | number>
    );
  }

  async getInvoice(invoiceId: number) {
    return this.request<{ invoice: Invoice }>('GET', `/customers/my/invoices/${invoiceId}`);
  }

  async getUnpaidFailedInvoices() {
    return this.request<{ unpaid_failed_invoices: Invoice[] }>('GET', '/customers/my/unpaid-payment-failed-invoices');
  }

  async proceedAction(actionId: number, proceed: boolean) {
    return this.request<void>('POST', `/actions/${actionId}/proceed`, { proceed });
  }

  // ==================== Servers ====================

  async listServers(params?: PaginationParams & { hostname?: string }) {
    return this.request<{ servers: Server[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/servers', undefined, params as Record<string, string | number>
    );
  }

  async getServer(serverId: number) {
    return this.request<{ server: Server }>('GET', `/servers/${serverId}`);
  }

  async createServer(request: CreateServerRequest) {
    return this.request<{ server: Server; links?: { action?: ActionLink } }>(
      'POST', '/servers', request
    );
  }

  async deleteServer(serverId: number, reason?: string) {
    return this.request<void>('DELETE', `/servers/${serverId}`, undefined, { reason });
  }

  async performServerAction(serverId: number, action: ServerAction) {
    return this.request<{ action: Action }>('POST', `/servers/${serverId}/actions`, action);
  }

  async listServerActions(serverId: number, params?: PaginationParams) {
    return this.request<{ actions: Action[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/servers/${serverId}/actions`, undefined, params as Record<string, string | number>
    );
  }

  async getServerAction(serverId: number, actionId: number) {
    return this.request<{ action: Action }>('GET', `/servers/${serverId}/actions/${actionId}`);
  }

  async getServerBackups(serverId: number, params?: PaginationParams) {
    return this.request<{ backups: Backup[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/servers/${serverId}/backups`, undefined, params as Record<string, string | number>
    );
  }

  async getServerFirewallRules(serverId: number) {
    return this.request<{ firewall_rules: AdvancedFirewallRule[] }>(
      'GET', `/servers/${serverId}/advanced_firewall_rules`
    );
  }

  async getServerConsole(serverId: number) {
    return this.request<{ console: ConsoleInfo }>('GET', `/servers/${serverId}/console`);
  }

  async getCurrentDataUsage(serverId: number) {
    return this.request<{ data_usage: DataUsage }>('GET', `/data_usages/${serverId}/current`);
  }

  async listAllDataUsage(params?: PaginationParams) {
    return this.request<{ data_usages: DataUsage[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/data_usages/current', undefined, params as Record<string, string | number>
    );
  }

  async getServerKernels(serverId: number, params?: PaginationParams) {
    return this.request<{ kernels: Kernel[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/servers/${serverId}/kernels`, undefined, params as Record<string, string | number>
    );
  }

  async getServerAvailableFeatures(serverId: number) {
    return this.request<{ available_advanced_server_features: AdvancedServerFeature[] }>(
      'GET', `/servers/${serverId}/available_advanced_features`
    );
  }

  async getServerThresholdAlerts(serverId: number) {
    return this.request<{ threshold_alerts: ThresholdAlert[] }>('GET', `/servers/${serverId}/threshold_alerts`);
  }

  async listExceededThresholdAlerts() {
    return this.request<{ current_server_alerts: CurrentServerAlert[] }>('GET', '/servers/threshold_alerts');
  }

  async getServerSoftware(serverId: number, params?: PaginationParams) {
    return this.request<{ software: LicensedSoftware[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/servers/${serverId}/software`, undefined, params as Record<string, string | number>
    );
  }

  async getServerUserData(serverId: number) {
    return this.request<{ user_data: string }>('GET', `/servers/${serverId}/user_data`);
  }

  async uploadBackup(serverId: number, request: UploadImageRequest) {
    return this.request<{ action: Action }>('POST', `/servers/${serverId}/backups`, request);
  }

  async getServerSnapshots(serverId: number, params?: PaginationParams) {
    return this.request<{ snapshots: Backup[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/servers/${serverId}/snapshots`, undefined, params as Record<string, string | number>
    );
  }

  async updateIpv6Reverse(serverId: number, ipAddress: string, reverseName: string) {
    return this.request<void>('PUT', '/reverse_names/ipv6', {
      server_id: serverId,
      ip_address: ipAddress,
      reverse_name: reverseName,
    });
  }

  // ==================== Metrics ====================

  async getServerMetrics(serverId: number, params?: {
    data_interval?: string;
    start?: string;
    end?: string;
    page?: number;
    per_page?: number;
  }) {
    return this.request<{ sample_sets: SampleSet[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/samplesets/${serverId}`, undefined, params as Record<string, string | number>
    );
  }

  async getServerLatestMetrics(serverId: number) {
    return this.request<{ sample_set: SampleSet }>('GET', `/samplesets/${serverId}/latest`);
  }

  // ==================== Images ====================

  async listImages(params?: PaginationParams & { type?: string }) {
    return this.request<{ images: Image[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/images', undefined, params as Record<string, string | number>
    );
  }

  async getImage(imageIdOrSlug: number | string) {
    return this.request<{ image: Image }>('GET', `/images/${imageIdOrSlug}`);
  }

  async deleteImage(imageId: number) {
    return this.request<void>('DELETE', `/images/${imageId}`);
  }

  async updateImage(imageId: number, request: UpdateImageRequest) {
    return this.request<{ image: Image }>('PUT', `/images/${imageId}`, request);
  }

  async getImageDownload(imageId: number) {
    return this.request<{ links: { download: string } }>('GET', `/images/${imageId}/download`);
  }

  // ==================== SSH Keys ====================

  async listSshKeys(params?: PaginationParams) {
    return this.request<{ ssh_keys: SshKey[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/account/keys', undefined, params as Record<string, string | number>
    );
  }

  async getSshKey(keyId: number) {
    return this.request<{ ssh_key: SshKey }>('GET', `/account/keys/${keyId}`);
  }

  async createSshKey(request: CreateSshKeyRequest) {
    return this.request<{ ssh_key: SshKey }>('POST', '/account/keys', request);
  }

  async updateSshKey(keyId: number, request: UpdateSshKeyRequest) {
    return this.request<{ ssh_key: SshKey }>('PUT', `/account/keys/${keyId}`, request);
  }

  async deleteSshKey(keyId: number) {
    return this.request<void>('DELETE', `/account/keys/${keyId}`);
  }

  // ==================== Domains ====================

  async listDomains(params?: PaginationParams) {
    return this.request<{ domains: Domain[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/domains', undefined, params as Record<string, string | number>
    );
  }

  async getDomain(domainName: string | number) {
    return this.request<{ domain: Domain }>('GET', `/domains/${domainName}`);
  }

  async createDomain(request: CreateDomainRequest) {
    return this.request<{ domain: Domain }>('POST', '/domains', request);
  }

  async deleteDomain(domainName: string | number) {
    return this.request<void>('DELETE', `/domains/${domainName}`);
  }

  async listDomainRecords(domainName: string | number, params?: PaginationParams) {
    return this.request<{ domain_records: DomainRecord[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/domains/${domainName}/records`, undefined, params as Record<string, string | number>
    );
  }

  async getDomainRecord(domainName: string | number, recordId: number) {
    return this.request<{ domain_record: DomainRecord }>(
      'GET', `/domains/${domainName}/records/${recordId}`
    );
  }

  async createDomainRecord(domainName: string | number, request: CreateDomainRecordRequest) {
    return this.request<{ domain_record: DomainRecord }>(
      'POST', `/domains/${domainName}/records`, request
    );
  }

  async updateDomainRecord(domainName: string | number, recordId: number, request: UpdateDomainRecordRequest) {
    return this.request<{ domain_record: DomainRecord }>(
      'PUT', `/domains/${domainName}/records/${recordId}`, request
    );
  }

  async deleteDomainRecord(domainName: string | number, recordId: number) {
    return this.request<void>('DELETE', `/domains/${domainName}/records/${recordId}`);
  }

  async listNameservers() {
    return this.request<{ nameservers: Nameserver[] }>('GET', '/domains/nameservers');
  }

  async refreshNameserverCache(domainName: string) {
    return this.request<void>('POST', '/domains/refresh_nameserver_cache', { domain_name: domainName });
  }

  // ==================== Reverse Names ====================

  async listIpv6ReverseName(params?: PaginationParams) {
    return this.request<{ reverse_names: ReverseName[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/reverse_names/ipv6', undefined, params as Record<string, string | number>
    );
  }

  // ==================== VPCs ====================

  async listVpcs(params?: PaginationParams) {
    return this.request<{ vpcs: Vpc[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/vpcs', undefined, params as Record<string, string | number>
    );
  }

  async getVpc(vpcId: number) {
    return this.request<{ vpc: Vpc }>('GET', `/vpcs/${vpcId}`);
  }

  async createVpc(request: CreateVpcRequest) {
    return this.request<{ vpc: Vpc }>('POST', '/vpcs', request);
  }

  async updateVpc(vpcId: number, request: UpdateVpcRequest) {
    return this.request<{ vpc: Vpc }>('PATCH', `/vpcs/${vpcId}`, request);
  }

  async deleteVpc(vpcId: number) {
    return this.request<void>('DELETE', `/vpcs/${vpcId}`);
  }

  async getVpcMembers(vpcId: number, params?: PaginationParams & { resource_type?: string }) {
    return this.request<{ members: VpcMember[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/vpcs/${vpcId}/members`, undefined, params as Record<string, string | number>
    );
  }

  // ==================== Load Balancers ====================

  async listLoadBalancers(params?: PaginationParams) {
    return this.request<{ load_balancers: LoadBalancer[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/load_balancers', undefined, params as Record<string, string | number>
    );
  }

  async getLoadBalancer(loadBalancerId: number) {
    return this.request<{ load_balancer: LoadBalancer }>('GET', `/load_balancers/${loadBalancerId}`);
  }

  async createLoadBalancer(request: CreateLoadBalancerRequest) {
    return this.request<{ load_balancer: LoadBalancer }>('POST', '/load_balancers', request);
  }

  async updateLoadBalancer(loadBalancerId: number, request: UpdateLoadBalancerRequest) {
    return this.request<{ load_balancer: LoadBalancer }>('PUT', `/load_balancers/${loadBalancerId}`, request);
  }

  async deleteLoadBalancer(loadBalancerId: number) {
    return this.request<void>('DELETE', `/load_balancers/${loadBalancerId}`);
  }

  async getLoadBalancerAvailability(region: string) {
    return this.request<{ load_balancer_availability: LoadBalancerAvailability[] }>(
      'GET', '/load_balancers/availability', undefined, { region }
    );
  }

  async addServersToLoadBalancer(loadBalancerId: number, serverIds: number[]) {
    return this.request<void>('POST', `/load_balancers/${loadBalancerId}/servers`, { server_ids: serverIds });
  }

  async removeServersFromLoadBalancer(loadBalancerId: number, serverIds: number[]) {
    return this.request<void>('DELETE', `/load_balancers/${loadBalancerId}/servers`, { server_ids: serverIds });
  }

  async addForwardingRulesToLoadBalancer(loadBalancerId: number, forwardingRules: ForwardingRule[]) {
    return this.request<void>('POST', `/load_balancers/${loadBalancerId}/forwarding_rules`, { forwarding_rules: forwardingRules });
  }

  async removeForwardingRulesFromLoadBalancer(loadBalancerId: number, forwardingRules: ForwardingRule[]) {
    return this.request<void>('DELETE', `/load_balancers/${loadBalancerId}/forwarding_rules`, { forwarding_rules: forwardingRules });
  }

  // ==================== Regions & Sizes ====================

  async listRegions() {
    return this.request<{ regions: Region[] }>('GET', '/regions');
  }

  async listSizes(params?: { server_id?: number; image?: string | number }) {
    return this.request<{ sizes: Size[] }>(
      'GET', '/sizes', undefined, params as Record<string, string | number>
    );
  }

  // ==================== Actions ====================

  async listActions(params?: PaginationParams) {
    return this.request<{ actions: Action[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/actions', undefined, params as Record<string, string | number>
    );
  }

  async getAction(actionId: number) {
    return this.request<{ action: Action }>('GET', `/actions/${actionId}`);
  }

  // ==================== Software ====================

  async listSoftware(params?: PaginationParams) {
    return this.request<{ software: Software[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', '/software', undefined, params as Record<string, string | number>
    );
  }

  async getSoftware(softwareId: number) {
    return this.request<{ software: Software }>('GET', `/software/${softwareId}`);
  }

  async listSoftwareForOS(operatingSystemId: string | number, params?: PaginationParams) {
    return this.request<{ software: Software[]; links?: LinksResponse; meta?: MetaResponse }>(
      'GET', `/software/operating_system/${operatingSystemId}`, undefined, params as Record<string, string | number>
    );
  }
}
