import { countCell, textCell, type ExportCell, type ExportTable } from '@esta/core/export';
import { sumUsage } from '@esta/core/agent-usage';
import { ChartColumn, History, Server, ShieldAlert } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { assistantStatus } from '@/components/assistant/assistant-header';
import { OperatorCard, operatorTime } from '@/components/assistant/operator-card';
import { OperatorTools } from '@/components/assistant/operator-tools';
import { WorkerStatusLine } from '@/components/assistant/worker-status-line';
import { ReportTable } from '@/components/reports/report-table';
import { loadDiagnostics, type DiagnosticRun } from '@/server/agent/diagnostics';
import { getClock } from '@/server/clock';
import { requireMember } from '@/server/member';

export async function generateMetadata() {
  const [member, t] = await Promise.all([requireMember(), getTranslations('assistant.diagnostics')]);
  return { title: t(member.can('operate') ? 'title' : 'notFoundTitle') };
}

export default async function DiagnosticsPage({ searchParams }: { searchParams: Promise<{ check?: string; watch?: string }> }) {
  const member = await requireMember();
  if (!member.can('operate')) notFound();
  const clock = await getClock();
  const [t, assistant, locale, status, diagnostics, { check, watch }] = await Promise.all([
    getTranslations('assistant.diagnostics'),
    getTranslations('assistant'),
    getLocale(),
    assistantStatus(clock.now()),
    loadDiagnostics(member.household.id, clock.now()),
    searchParams,
  ]);
  const usd = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
  const cost = (value: number | null) => textCell(value === null ? assistant('unknown') : usd.format(value));
  const duration = (ms: number) => t('duration', { minutes: Math.floor(Math.round(ms / 1000) / 60), seconds: Math.round(ms / 1000) % 60 });
  // `mcp__esta__household_info` reads as `household_info`: the SDK's server prefix is one long word a phone cannot wrap.
  const tools = (run: DiagnosticRun) =>
    [
      ...Object.entries(run.toolCalls).map(([name, count]) => assistant('toolCall', { name: name.replace(/^mcp__[^_]+__/, ''), count })),
      ...run.denials.map(({ tool, code }) => assistant('toolDenied', { name: tool.replace(/^mcp__[^_]+__/, ''), reason: assistant(`denialReason.${code}`) })),
    ].join(', ') || assistant('noToolCalls');
  const runColumns = ['time', 'kind', 'status', 'turns', 'duration', 'model', 'cost', 'toolCalls'] as const;
  const runRow = (run: DiagnosticRun): ExportCell[] => [
    textCell(operatorTime(run.startedAt)),
    textCell(run.kind),
    textCell(t(`runStatus.${run.status}`)),
    run.numTurns === null ? textCell(assistant('unknown')) : countCell(run.numTurns),
    textCell(run.durationMs === null ? assistant('unknown') : duration(run.durationMs)),
    textCell(run.model ?? assistant('unknown')),
    cost(run.costUsd),
    textCell(tools(run)),
  ];
  const runs: ExportTable = {
    columns: runColumns.map((id) => ({ id, label: t(`runColumns.${id}`) })),
    rows: diagnostics.runs.map((run) => ({ key: run.id, cells: runRow(run) })),
    totals: {
      key: 'total',
      cells: [
        textCell(t('runCount', { count: diagnostics.runs.length })),
        textCell(''),
        textCell(''),
        countCell(diagnostics.runs.reduce((sum, run) => sum + (run.numTurns ?? 0), 0)),
        textCell(duration(diagnostics.runs.reduce((sum, run) => sum + (run.durationMs ?? 0), 0))),
        textCell(''),
        cost(diagnostics.runs.reduce((sum, run) => sum + (run.costUsd ?? 0), 0)),
        textCell(''),
      ],
    },
  };
  const usageColumns = ['kind', 'runs', 'turns', 'inputTokens', 'outputTokens', 'cost'] as const;
  const total = sumUsage(diagnostics.usage);
  const usageRow = (key: string, row: typeof total): ExportCell[] => [textCell(key), countCell(row.runs), countCell(row.turns), countCell(row.inputTokens), countCell(row.outputTokens), cost(row.costUsd)];
  const usage: ExportTable = {
    columns: usageColumns.map((id) => ({ id, label: t(`usageColumns.${id}`) })),
    rows: diagnostics.usage.map((row) => ({ key: row.kind, cells: usageRow(row.kind, row) })),
    totals: { key: 'total', cells: usageRow(t('total'), total) },
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href="/assistant" className="inline-flex min-h-touch w-fit items-center text-body font-medium text-text-secondary underline underline-offset-4 hover:decoration-2">
          {t('back')}
        </Link>
        <h1 className="text-title-2 break-words lg:text-title-1">{t('title')}</h1>
        <p className="max-w-prose text-body text-pretty text-text-secondary">{t('intro')}</p>
      </div>
      <OperatorTools householdId={member.household.id} failed={{ check: check === 'failed', watch: watch === 'failed' }} workerOnline={status.kind === 'online'} />
      <OperatorCard id="diagnostics-worker" icon={Server} title={t('worker')}>
        {status.kind === 'offline' || status.kind === 'paused' ? null : <WorkerStatusLine status={status} />}
        {diagnostics.worker === null ? (
          <p className="text-text-muted">{t('noWorker')}</p>
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
            <dt className="text-text-muted">{t('authMode')}</dt>
            <dd data-testid="diagnostics-auth-mode">{diagnostics.worker.authMode}</dd>
            <dt className="text-text-muted">{t('agentMode')}</dt>
            <dd data-testid="diagnostics-agent-mode">{diagnostics.worker.agentMode}</dd>
          </dl>
        )}
      </OperatorCard>
      <OperatorCard id="diagnostics-runs" icon={History} title={t('runs')}>
        {diagnostics.runs.length === 0 ? <p className="text-text-muted">{assistant('noRuns')}</p> : <ReportTable table={runs} caption={t('runs')} />}
      </OperatorCard>
      <OperatorCard id="diagnostics-usage" icon={ChartColumn} title={t('usage')}>
        {diagnostics.usage.length === 0 ? <p className="text-text-muted">{t('noUsage')}</p> : <ReportTable table={usage} caption={t('usage')} strong="cost" />}
      </OperatorCard>
      <OperatorCard id="diagnostics-held" icon={ShieldAlert} title={t('held')}>
        {diagnostics.guardHeld.length === 0 ? (
          <p className="text-text-muted">{t('noHeld')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-body">
            {diagnostics.guardHeld.map((note) => (
              <li key={note.id} data-testid="diagnostics-held-note" className="num">
                {t('heldNote', { time: operatorTime(note.createdAt), kind: note.kind ?? assistant('unknown') })}
              </li>
            ))}
          </ul>
        )}
      </OperatorCard>
    </div>
  );
}
