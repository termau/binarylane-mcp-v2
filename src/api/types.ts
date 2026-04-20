/**
 * BinaryLane API type definitions
 */

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

export interface LinksResponse {
  pages?: {
    first?: string;
    prev?: string;
    next?: string;
    last?: string;
  };
}

export interface MetaResponse {
  total?: number;
}

export interface Account {
  email: string;
  email_verified: boolean;
  two_factor_authentication_enabled: boolean;
  status: string;
  tax_code?: {
    name: string;
    type: string;
    fixed_percent: number;
  };
  configured_payment_methods?: string[];
  additional_ipv4_limit?: number;
  credit_limit?: number;
  server_limit?: number;
}

export interface Balance {
  unbilled_total: number;
  available_credit: number;
  charges: BalanceCharge[];
  generated_at: string;
  // Legacy fields (may not be present in newer API)
  account_balance?: string;
  month_to_date_usage?: string;
  month_to_date_balance?: string;
}

export interface BalanceCharge {
  description: string;
  amount: number;
  date?: string;
}

export interface Invoice {
  invoice_id: number;
  invoice_number: string;
  amount: string;
  tax_code: string;
  created: string;
  date_due?: string;
  date_overdue?: string;
  paid: boolean;
  refunded: boolean;
  invoice_download_url?: string;
  tax_invoice_download_url?: string;
}

export interface Server {
  id: number;
  name: string;
  memory: number;
  vcpus: number;
  disk: number;
  created_at: string;
  status: string;
  backup_ids: number[];
  features: string[];
  region: Region;
  image: Image;
  size: Size;
  size_slug: string;
  networks: Networks;
  vpc_id?: number | null;
  next_backup_window?: BackupWindow | null;
  password_change_supported: boolean;
  selected_size_options?: SizeOptions | null;
  partner_id?: number | null;
  failover_ips?: string[];
  host?: Host | null;
  disks?: Disk[];
  cancelled_at?: string | null;
  kernel?: any | null;
  backup_settings?: any;
  permalink?: string;
  attached_backup?: any | null;
  advanced_features?: Record<string, boolean>;
}

export interface Region {
  slug: string;
  name: string;
  sizes: string[];
  available: boolean;
  features: string[];
  name_servers?: string[];
}

export interface Image {
  id: number;
  name: string;
  type: string;
  distribution?: string;
  full_name?: string;
  slug?: string | null;
  public: boolean;
  regions: string[];
  min_disk_size?: number;
  min_memory_megabytes?: number;
  size_gigabytes?: number;
  created_at: string;
  description?: string | null;
  status: string;
  error_message?: string | null;
  backup_type?: string;
  distribution_surcharges?: any;
  distribution_info?: any;
  backup_info?: any;
}

export interface Size {
  slug: string;
  available: boolean;
  regions: string[];
  regions_out_of_stock?: string[];
  price_monthly: number;
  price_hourly: number;
  disk: number;
  memory: number;
  transfer: number;
  excess_transfer_cost_per_gigabyte?: number;
  vcpus: number;
  vcpu_units: string;
  size_type?: string;
  options?: SizeOptions;
  description?: string;
  cpu_description?: string;
  storage_description?: string;
  exceeds_original_regions?: boolean;
}

export interface SizeOptions {
  ipv4_addresses?: number;
  memory?: number;
  disk?: number;
  transfer?: number;
  offsite_backup_copies?: number;
}

export interface Networks {
  v4: NetworkV4[];
  v6: NetworkV6[];
  port_blocking?: boolean;
  separate_private_network_interface?: boolean;
  source_and_destination_check?: boolean;
  recent_ddos?: boolean;
  ipv6_reverse_nameservers?: string[];
}

export interface NetworkV4 {
  ip_address: string;
  netmask: string;
  gateway: string;
  type: string;
  reverse_name?: string;
}

export interface NetworkV6 {
  ip_address: string;
  netmask: number;
  gateway: string;
  type: string;
  reverse_name?: string;
}

export interface BackupWindow {
  start: string;
  end: string;
}

export interface Host {
  display_name?: string;
}

export interface Disk {
  id: number;
  size_gigabytes: number;
  description?: string;
  primary: boolean;
}

export interface CreateServerRequest {
  size: string;
  image: string | number;
  region: string;
  name?: string;
  backups?: boolean;
  ipv6?: boolean;
  vpc_id?: number;
  ssh_keys?: (number | string)[];
  user_data?: string;
  options?: SizeOptions;
  port_blocking?: boolean;
  password?: string;
}

// Base type for all server actions
interface BaseServerAction {
  type: string;
}

interface SimpleServerAction extends BaseServerAction {
  type: 'power_on' | 'power_off' | 'reboot' | 'shutdown' | 'power_cycle' |
        'ping' | 'uptime' | 'is_running' |
        'password_reset' | 'disable_selinux' |
        'enable_backups' | 'disable_backups' | 'detach_backup' |
        'enable_ipv6' | 'uncancel';
}

interface ImageServerAction extends BaseServerAction {
  type: 'rebuild' | 'restore' | 'attach_backup';
  image: string | number;
}

interface ResizeServerAction extends BaseServerAction {
  type: 'resize';
  size: string;
}

interface RenameServerAction extends BaseServerAction {
  type: 'rename';
  name: string;
}

interface TakeBackupServerAction extends BaseServerAction {
  type: 'take_backup';
  backup_type?: 'daily' | 'weekly' | 'monthly' | 'temporary';
  replacement_strategy?: 'none' | 'specified' | 'oldest' | 'newest';
  backup_id_to_replace?: number;
  label?: string;
}

interface CloneUsingBackupServerAction extends BaseServerAction {
  type: 'clone_using_backup';
  image: string | number;
  target_server_id: number;
}

interface AddDiskServerAction extends BaseServerAction {
  type: 'add_disk';
  size_gigabytes: number;
}

interface ResizeDiskServerAction extends BaseServerAction {
  type: 'resize_disk';
  disk_id: number;
  size_gigabytes: number;
}

interface DeleteDiskServerAction extends BaseServerAction {
  type: 'delete_disk';
  disk_id: number;
}

interface ChangeVpcIpv4ServerAction extends BaseServerAction {
  type: 'change_vpc_ipv4';
  ipv4_address: string;
}

interface ChangeReverseNameServerAction extends BaseServerAction {
  type: 'change_reverse_name';
  reverse_name: string;
}

interface ToggleServerAction extends BaseServerAction {
  type: 'change_ipv6' | 'change_port_blocking' | 'change_network' |
        'change_source_and_destination_check' | 'change_separate_private_network_interface';
  enabled: boolean;
}

interface AdvancedFeaturesServerAction extends BaseServerAction {
  type: 'change_advanced_features';
  features: Record<string, boolean>;
}

interface AdvancedFirewallServerAction extends BaseServerAction {
  type: 'change_advanced_firewall_rules';
  firewall_rules: AdvancedFirewallRule[];
}

interface ThresholdAlertsServerAction extends BaseServerAction {
  type: 'change_threshold_alerts';
  threshold_alerts: Array<{
    alert_type: string;
    value: number;
    enabled: boolean;
  }>;
}

interface ChangeKernelServerAction extends BaseServerAction {
  type: 'change_kernel';
  kernel: number;
}

interface ChangeRegionServerAction extends BaseServerAction {
  type: 'change_region';
  region: string;
}

interface BackupScheduleServerAction extends BaseServerAction {
  type: 'change_backup_schedule' | 'change_offsite_backup_location' | 'change_manage_offsite_backup_copies';
}

interface ChangeIpv6ReverseNameserversServerAction extends BaseServerAction {
  type: 'change_ipv6_reverse_nameservers';
}

interface ChangePartnerServerAction extends BaseServerAction {
  type: 'change_partner';
  partner_server_id: number;
}

export type ServerAction =
  | SimpleServerAction
  | ImageServerAction
  | ResizeServerAction
  | RenameServerAction
  | TakeBackupServerAction
  | CloneUsingBackupServerAction
  | AddDiskServerAction
  | ResizeDiskServerAction
  | DeleteDiskServerAction
  | ChangeVpcIpv4ServerAction
  | ChangeReverseNameServerAction
  | ToggleServerAction
  | AdvancedFeaturesServerAction
  | AdvancedFirewallServerAction
  | ThresholdAlertsServerAction
  | ChangeKernelServerAction
  | ChangeRegionServerAction
  | BackupScheduleServerAction
  | ChangeIpv6ReverseNameserversServerAction
  | ChangePartnerServerAction;

export interface Action {
  id: number;
  status: string;
  type: string;
  started_at: string;
  completed_at?: string;
  resource_id?: number;
  resource_type?: string;
  region?: Region;
  region_slug?: string;
  result_data?: string;
  blocking_invoice_id?: number;
  user_interaction_required?: UserInteraction;
  progress?: ActionProgress;
}

export interface UserInteraction {
  interaction_type: string;
}

export interface ActionProgress {
  current_step?: string;
  percent_complete?: number;
}

export interface ActionLink {
  id: number;
  rel: string;
  href: string;
}

export interface Backup {
  id: number;
  server_id: number;
  name?: string;
  slug?: string;
  created_at: string;
  type: string;
  regions: string[];
  min_disk_size: number;
  size_gigabytes: number;
  status: string;
  backup_type?: string;
  description?: string;
  offsite_backup_regions?: OffsiteBackup[];
}

export interface OffsiteBackup {
  region_slug: string;
  destination?: string;
  status?: string;
}

export interface AdvancedFirewallRule {
  source_addresses: string[];
  destination_addresses: string[];
  destination_ports?: string[];
  protocol: string;
  action: string;
  description?: string;
}

export interface ConsoleInfo {
  vnc_url?: string;
  web_vnc_url?: string;
}

export interface DataUsage {
  server_id: number;
  expires: string;
  transfer_gigabytes: number;
  current_transfer_usage_gigabytes: number;
  transfer_period_end: string;
}

export interface SshKey {
  id: number;
  fingerprint: string;
  public_key: string;
  name: string;
  default: boolean;
}

export interface CreateSshKeyRequest {
  public_key: string;
  name: string;
  default?: boolean;
}

export interface UpdateSshKeyRequest {
  name?: string;
  default?: boolean;
}

export interface Domain {
  name: string;
  current_nameservers?: string[];
  zone_file?: string;
}

export interface CreateDomainRequest {
  name: string;
  ip_address?: string;
}

export interface DomainRecord {
  id: number;
  type: string;
  name: string;
  data: string;
  priority?: number;
  port?: number;
  ttl: number;
  weight?: number;
  flags?: number;
  tag?: string;
}

export interface CreateDomainRecordRequest {
  type: string;
  name: string;
  data: string;
  priority?: number;
  port?: number;
  ttl?: number;
  weight?: number;
  flags?: number;
  tag?: string;
}

export interface UpdateDomainRecordRequest {
  type?: string;
  name?: string;
  data?: string;
  priority?: number;
  port?: number;
  ttl?: number;
  weight?: number;
  flags?: number;
  tag?: string;
}

export interface UpdateImageRequest {
  name?: string;
  description?: string;
}

export interface Vpc {
  id: number;
  name: string;
  ip_range: string;
  route_entries: RouteEntry[];
}

export interface RouteEntry {
  router: string;
  destination: string;
  description?: string;
}

export interface CreateVpcRequest {
  name: string;
  ip_range?: string;
}

export interface UpdateVpcRequest {
  name?: string;
  route_entries?: RouteEntry[];
}

export interface VpcMember {
  name: string;
  resource_type: string;
  resource_id: number;
  created_at: string;
}

export interface LoadBalancer {
  id: number;
  name: string;
  ip: string;
  status: string;
  created_at: string;
  region: Region;
  size_slug?: string;
  algorithm?: string;
  forwarding_rules: ForwardingRule[];
  health_check?: HealthCheck;
  sticky_sessions?: StickySession;
  server_ids: number[];
}

export interface ForwardingRule {
  entry_protocol: string;
  entry_port: number;
  target_protocol: string;
  target_port: number;
  certificate_id?: string;
  tls_passthrough?: boolean;
}

export interface HealthCheck {
  protocol: string;
  port: number;
  path?: string;
  hostname?: string;
  check_interval_seconds?: number;
  response_timeout_seconds?: number;
  unhealthy_threshold?: number;
  healthy_threshold?: number;
}

export interface StickySession {
  type?: string;
  cookie_name?: string;
  cookie_ttl_seconds?: number;
}

export interface CreateLoadBalancerRequest {
  name: string;
  forwarding_rules: ForwardingRule[];
  health_check?: HealthCheck;
  sticky_sessions?: StickySession;
  server_ids?: number[];
  algorithm?: string;
  size_slug?: string;
}

export interface UpdateLoadBalancerRequest {
  name?: string;
  forwarding_rules?: ForwardingRule[];
  health_check?: HealthCheck;
  sticky_sessions?: StickySession;
  server_ids?: number[];
  algorithm?: string;
}

export interface Software {
  id: number;
  name: string;
  description?: string;
  cost_per_licence_per_month: number;
  minimum_licence_count: number;
  maximum_licence_count: number;
  licence_step_count: number;
  supported_operating_systems?: string[];
  group?: string;
}

export interface Kernel {
  id: number;
  name: string;
  version: string;
}

export interface AdvancedServerFeature {
  feature: string;
  enabled: boolean;
  description?: string;
}

export interface ThresholdAlert {
  alert_type: string;
  value: number;
  current_value?: number;
  enabled: boolean;
}

export interface CurrentServerAlert {
  server_id: number;
  alert_type: string;
  value: number;
  current_value: number;
}

export interface LicensedSoftware {
  software_id: number;
  name: string;
  licence_count: number;
}

export interface SampleSet {
  server_id: number;
  period: {
    start: string;
    end: string;
    data_interval: string;
  };
  average?: SampleData;
  maximum_memory_megabytes?: number;
  maximum_storage_gigabytes?: number;
  // Legacy fields from v1 types (may appear in historical metrics)
  data?: SampleData[];
}

export interface SampleData {
  cpu_usage_percent: number;
  cpu_usage_detailed?: number[];
  memory_usage_bytes: number;
  network_incoming_kbps: number;
  network_outgoing_kbps: number;
  storage_usage_megabytes: number;
  storage_read_kbps: number;
  storage_write_kbps: number;
  storage_read_requests_per_second: number;
  storage_write_requests_per_second: number;
}

export interface UploadImageRequest {
  url: string;
  label?: string;
  backup_type?: string;
}

export interface Nameserver {
  name: string;
  ip_addresses: string[];
}

export interface ReverseName {
  ip_address: string;
  reverse_name: string;
  server_id?: number;
}

export interface LoadBalancerAvailability {
  region_slug: string;
  options: LoadBalancerOption[];
}

export interface LoadBalancerOption {
  size_slug: string;
  price_monthly: number;
  price_hourly: number;
}
