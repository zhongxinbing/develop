export type DateString = string;

export type RuleMetrics = {
  runtime: number;
  memory: number;
};

export type DailyMetricsSingle = Record<string, Record<string, RuleMetrics>>;
export type DailyMetricsMulti = Record<string, Record<string, { thread_metrics: Record<string, RuleMetrics> }>>;

export type SingleThreadToolData = {
  casename_key: string;
  daily_metrics_key: DailyMetricsSingle;
};

export type MultiThreadToolData = {
  casename_key: string;
  daily_metrics_key: DailyMetricsMulti;
};

export type ExtraTag = {
  name: string;
  value: string;
};

export type ToolConfig = {
  id: string;
  name: string;
  description: string;
  singleThreadPath: string;
  multiThreadPath?: string;
  extraTags: ExtraTag[];
  fetchSingleFunc: string;
  fetchMultiFunc?: string;
  customCurveFunc?: string;
};

export type ToolConfigRecord = Record<string, ToolConfig>;

export type ChartPoint = {
  date: DateString;
  rule: string;
  value: number;
  metadata?: Record<string, string>;
  source?: 'baseline' | 'user';
  extra?: string;
};

export type CompareMode = 'absolute' | 'percentage';
export type CompareDimension = 'all' | 'runtime' | 'memory';

export type CompareRequest = {
  casename: string;
  rule: string;
  date1: string;
  date2: string;
  errorMode: CompareMode;
  dimension: CompareDimension;
  runtimeLimit?: number;
  memoryLimit?: number;
};
