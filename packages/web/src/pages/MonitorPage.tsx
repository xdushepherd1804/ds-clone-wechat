import { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Card, Statistic, Row, Col, Progress, Space, Typography, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LockOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  DatabaseOutlined,
  CodeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

// ─── Types ──────────────────────────────────────────────────────────────────

interface TaskStats {
  turns: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read: number | null;
  cache_creation: number | null;
  total_tokens: number | null;
  tool_calls: number | null;
}

interface TaskDep {
  id: string;
  status: string;
}

interface TaskItem {
  id: string;
  name: string;
  status: string;
  phase: string;
  priority: string;
  agent: string;
  dependencies: TaskDep[];
  runtime_seconds: number | null;
  stats: TaskStats;
}

interface MonitorData {
  generated_at: string;
  generated_ts: number;
  tasks: TaskItem[];
  summary: {
    total_tasks: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
    blocked: number;
    progress_pct: number;
  };
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmtToken(v: number | null): string {
  if (v == null) return '--';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function fmtRuntime(seconds: number | null): string {
  if (seconds == null) return '--';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
}

function fmtTooltipTokens(stats: TaskStats): string {
  const parts: string[] = [];
  if (stats.input_tokens != null) parts.push(`输入: ${stats.input_tokens.toLocaleString()}`);
  if (stats.output_tokens != null) parts.push(`输出: ${stats.output_tokens.toLocaleString()}`);
  if (stats.cache_read != null) parts.push(`缓存读: ${stats.cache_read.toLocaleString()}`);
  if (stats.cache_creation != null) parts.push(`缓存写: ${stats.cache_creation.toLocaleString()}`);
  return parts.join('\n');
}

// ─── Status config ──────────────────────────────────────────────────────────

const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: 'default', icon: <ClockCircleOutlined />, label: '待执行' },
  in_progress: { color: 'processing', icon: <SyncOutlined spin />, label: '执行中' },
  completed: { color: 'success', icon: <CheckCircleOutlined />, label: '已完成' },
  failed: { color: 'error', icon: <CloseCircleOutlined />, label: '失败' },
  blocked: { color: 'warning', icon: <LockOutlined />, label: '受阻' },
};

const statusSortOrder: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  completed: 3,
  failed: 4,
};

// ─── Main component ─────────────────────────────────────────────────────────

export default function MonitorPage() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>('--');

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetch(`/monitor-stats.json?t=${Date.now()}`);
      if (resp.ok) {
        const json: MonitorData = await resp.json();
        setData(json);
        setLastRefresh(new Date().toLocaleTimeString('zh-CN', { hour12: false }));
      }
    } catch {
      // file may not exist yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  // ─── Compute aggregate token totals ────────────────────────────────────

  const totalTokens = data?.tasks.reduce((sum, t) => sum + (t.stats.total_tokens ?? 0), 0) ?? 0;
  const totalInput = data?.tasks.reduce((sum, t) => sum + (t.stats.input_tokens ?? 0), 0) ?? 0;
  const totalOutput = data?.tasks.reduce((sum, t) => sum + (t.stats.output_tokens ?? 0), 0) ?? 0;
  const totalCache = data?.tasks.reduce((sum, t) => sum + (t.stats.cache_read ?? 0), 0) ?? 0;
  const totalTurns = data?.tasks.reduce((sum, t) => sum + (t.stats.turns ?? 0), 0) ?? 0;
  const totalToolCalls = data?.tasks.reduce((sum, t) => sum + (t.stats.tool_calls ?? 0), 0) ?? 0;
  const tasksWithStats = data?.tasks.filter(t => t.stats.total_tokens != null).length ?? 0;

  // ─── Columns ───────────────────────────────────────────────────────────

  const columns = [
    {
      title: '任务',
      dataIndex: 'id',
      key: 'id',
      width: 72,
      render: (id: string) => <Text code style={{ fontSize: 12 }}>{id}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string) => (
        <span style={{ fontWeight: 500 }}>{name}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const cfg = statusConfig[status] ?? { color: 'default', icon: null, label: status };
        return (
          <Tag color={cfg.color} icon={cfg.icon}>
            {cfg.label}
          </Tag>
        );
      },
    },
    {
      title: '阶段',
      dataIndex: 'phase',
      key: 'phase',
      width: 70,
      align: 'center' as const,
    },
    {
      title: '耗时',
      dataIndex: 'runtime_seconds',
      key: 'runtime',
      width: 80,
      align: 'right' as const,
      render: (v: number | null) => (
        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {fmtRuntime(v)}
        </Text>
      ),
    },
    {
      title: '轮次',
      dataIndex: ['stats', 'turns'],
      key: 'turns',
      width: 64,
      align: 'right' as const,
      render: (v: number | null) => (
        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {v ?? '--'}
        </Text>
      ),
    },
    {
      title: '工具',
      dataIndex: ['stats', 'tool_calls'],
      key: 'tool_calls',
      width: 64,
      align: 'right' as const,
      render: (v: number | null) => (
        <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
          {v ?? '--'}
        </Text>
      ),
    },
    {
      title: '输入',
      dataIndex: ['stats', 'input_tokens'],
      key: 'input',
      width: 80,
      align: 'right' as const,
      render: (v: number | null) => (
        <Tooltip title={v?.toLocaleString()}>
          <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
            {fmtToken(v)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '输出',
      dataIndex: ['stats', 'output_tokens'],
      key: 'output',
      width: 80,
      align: 'right' as const,
      render: (v: number | null) => (
        <Tooltip title={v?.toLocaleString()}>
          <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
            {fmtToken(v)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '缓存',
      dataIndex: ['stats', 'cache_read'],
      key: 'cache',
      width: 80,
      align: 'right' as const,
      render: (v: number | null) => (
        <Tooltip title={v?.toLocaleString()}>
          <Text style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>
            {fmtToken(v)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '合计',
      key: 'total',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, record: TaskItem) => {
        const v = record.stats.total_tokens;
        return (
          <Tooltip title={fmtTooltipTokens(record.stats)}>
            <Text strong style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13, color: '#1677ff' }}>
              {fmtToken(v)}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: '依赖',
      dataIndex: 'dependencies',
      key: 'deps',
      width: 120,
      ellipsis: true,
      render: (deps: TaskDep[]) => {
        if (!deps || deps.length === 0) return <Text type="secondary">--</Text>;
        return (
          <Space size={2} wrap>
            {deps.map(d => {
              const clr = d.status === 'completed' ? 'success' : d.status === 'failed' ? 'error' : 'default';
              return (
                <Tag key={d.id} color={clr} style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>
                  {d.id}
                </Tag>
              );
            })}
          </Space>
        );
      },
    },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#f5f5f5' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            任务监控
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            刷新间隔 10s · 上次刷新 {lastRefresh}
          </Text>
        </div>
        <ReloadOutlined
          onClick={fetchData}
          spin={loading}
          style={{ fontSize: 18, cursor: 'pointer', color: '#1677ff' }}
        />
      </div>

      {/* Summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="总任务" value={data?.summary.total_tasks ?? '--'} prefix={<CodeOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="已完成" value={data?.summary.completed ?? '--'} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="执行中" value={data?.summary.in_progress ?? '--'} valueStyle={{ color: '#1677ff' }} prefix={<SyncOutlined spin />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="失败" value={data?.summary.failed ?? '--'} valueStyle={{ color: data?.summary.failed ? '#ff4d4f' : undefined }} prefix={<CloseCircleOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="受阻" value={data?.summary.blocked ?? '--'} valueStyle={{ color: data?.summary.blocked ? '#faad14' : undefined }} prefix={<LockOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small">
            <Statistic title="进度" value={data?.summary.progress_pct ?? '--'} suffix="%" valueStyle={{ color: (data?.summary.progress_pct ?? 0) >= 80 ? '#52c41a' : '#1677ff' }} />
          </Card>
        </Col>
      </Row>

      <Progress
        percent={data?.summary.progress_pct ?? 0}
        strokeColor={(data?.summary.progress_pct ?? 0) >= 80 ? '#52c41a' : '#1677ff'}
        style={{ marginBottom: 20 }}
      />

      {/* Token summary row */}
      <Card size="small" style={{ marginBottom: 20 }}>
        <Row gutter={24}>
          <Col span={6}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <ApiOutlined /> 总 Token
              </Text>
              <div>
                <Text strong style={{ fontSize: 20, color: '#1677ff', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtToken(totalTokens)}
                </Text>
              </div>
              <Tooltip title={totalTokens.toLocaleString()}>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {totalTokens.toLocaleString()} tokens
                </Text>
              </Tooltip>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>输入</Text>
              <div>
                <Text style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtToken(totalInput)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {totalInput.toLocaleString()}
              </Text>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>输出</Text>
              <div>
                <Text style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtToken(totalOutput)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {totalOutput.toLocaleString()}
              </Text>
            </div>
          </Col>
          <Col span={4}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                <DatabaseOutlined /> 缓存
              </Text>
              <div>
                <Text style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtToken(totalCache)}
                </Text>
              </div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {totalCache.toLocaleString()}
              </Text>
            </div>
          </Col>
          <Col span={3}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>轮次</Text>
              <div>
                <Text style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {totalTurns.toLocaleString()}
                </Text>
              </div>
            </div>
          </Col>
          <Col span={3}>
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>工具调用</Text>
              <div>
                <Text style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
                  {totalToolCalls.toLocaleString()}
                </Text>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Task table */}
      <Card
        size="small"
        title={
          <Space>
            <span>任务列表</span>
            {tasksWithStats > 0 && (
              <Tag color="blue">{tasksWithStats} 个任务有统计</Tag>
            )}
          </Space>
        }
      >
        <Table
          dataSource={[...(data?.tasks ?? [])].sort((a, b) => (statusSortOrder[a.status] ?? 5) - (statusSortOrder[b.status] ?? 5))}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 1100 }}
          locale={{ emptyText: '暂无数据，请运行 ./scripts/generate-stats.sh 生成统计数据' }}
          rowClassName={(record) => {
            if (record.status === 'in_progress') return 'monitor-row--active';
            if (record.status === 'failed') return 'monitor-row--failed';
            return '';
          }}
        />
      </Card>

      <style>{`
        .monitor-row--active { background: #e6f4ff !important; }
        .monitor-row--failed { background: #fff2f0 !important; }
        .ant-table-row:hover.monitor-row--active { background: #bae0ff !important; }
        .ant-table-row:hover.monitor-row--failed { background: #ffe4e0 !important; }
        .ant-table-cell { font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
