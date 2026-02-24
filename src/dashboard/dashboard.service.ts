import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import type {
  DashboardAreaPoint,
  DashboardAreaBranchGroup,
  DashboardAreaResponse,
  DashboardBranchPerformanceItem,
  DashboardBranchPerformanceResponse,
  DashboardPanelResponse,
  DashboardRangeInfo,
  DashboardServicePerformanceBranchGroup,
  DashboardServicePerformanceResponse,
  DashboardSummaryResponse,
  DashboardWindowPerformanceBranchGroup,
  DashboardWindowPerformanceResponse,
} from './dto/dashboard-response.dto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

type NormalizedRange = {
  from: Date;
  to: Date;
  days: number;
};

type DayTotalRow = {
  day: string;
  total: number;
};

type BranchDayTotalRow = DayTotalRow & {
  branchId: string;
  branchName: string;
};

type ActiveBranchRow = {
  branchId: string;
  branchName: string;
};

type SummaryAggregateRow = {
  ticketsCreated: number;
  ticketsAttended: number;
  ticketsCancelled: number;
  queueNow: number;
  attendingNow: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

type BranchPerformanceRow = {
  branchId: string;
  branchName: string;
  ticketsCreated: number;
  ticketsAttended: number;
  ticketsCancelled: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

type WindowPerformanceRow = {
  branchId: string;
  branchName: string;
  windowId: string;
  windowName: string;
  windowCode: string;
  ticketsAttended: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

type ServicePerformanceRow = {
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  ticketsAttended: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

type AreaPointAccumulator = {
  date: string;
  created: number;
  attended: number;
  cancelled: number;
  completionRatePct: number;
};

type AreaBranchAccumulator = {
  branchId: string;
  branchName: string;
  data: AreaPointAccumulator[];
};

type ServiceItemAccumulator = {
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  ticketsAttended: number;
  attendanceSharePct: number;
  averageWaitMinutes: number;
  averageAttentionMinutes: number;
};

type ServiceBranchAccumulator = {
  branchId: string;
  branchName: string;
  totalAttended: number;
  services: ServiceItemAccumulator[];
};

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getPanel(): Promise<DashboardPanelResponse> {
    const normalizedRange = this.buildDefaultRange();

    const [summary, area, branches, windows, services] = await Promise.all([
      this.getSummaryByRange(normalizedRange),
      this.getAreaByRange(normalizedRange),
      this.getBranchesPerformanceByRange(normalizedRange),
      this.getWindowsPerformanceByRange(normalizedRange),
      this.getServicesPerformanceByRange(normalizedRange),
    ]);

    return { summary, area, branches, windows, services };
  }

  async getSummary(): Promise<DashboardSummaryResponse> {
    return this.getSummaryByRange(this.buildDefaultRange());
  }

  async getArea(): Promise<DashboardAreaResponse> {
    return this.getAreaByRange(this.buildDefaultRange());
  }

  async getBranchesPerformance(): Promise<DashboardBranchPerformanceResponse> {
    return this.getBranchesPerformanceByRange(this.buildDefaultRange());
  }

  async getWindowsPerformance(): Promise<DashboardWindowPerformanceResponse> {
    return this.getWindowsPerformanceByRange(this.buildDefaultRange());
  }

  async getServicesPerformance(): Promise<DashboardServicePerformanceResponse> {
    return this.getServicesPerformanceByRange(this.buildDefaultRange());
  }

  private buildDefaultRange(): NormalizedRange {
    const to = new Date(Date.now());
    const from = new Date(to.getTime());
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);

    return {
      from,
      to,
      days: this.calculateRangeDays(from, to),
    };
  }

  private calculateRangeDays(from: Date, to: Date): number {
    const fromUtcMidnight = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
    );

    const toUtcMidnight = Date.UTC(
      to.getUTCFullYear(),
      to.getUTCMonth(),
      to.getUTCDate(),
    );

    return Math.floor((toUtcMidnight - fromUtcMidnight) / ONE_DAY_IN_MS) + 1;
  }

  private toRangeInfo(range: NormalizedRange): DashboardRangeInfo {
    return {
      from: range.from,
      to: range.to,
      days: range.days,
    };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round(value: number, decimals = 2): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }

  private calculateRate(numerator: number, denominator: number): number {
    if (denominator <= 0) return 0;
    return this.round((numerator / denominator) * 100, 2);
  }

  private buildDailyKeys(from: Date, to: Date): string[] {
    const cursor = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
    );
    const end = new Date(
      Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
    );

    const keys: string[] = [];

    while (cursor.getTime() <= end.getTime()) {
      keys.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return keys;
  }

  private async getActiveBranches(): Promise<ActiveBranchRow[]> {
    const rows: ActiveBranchRow[] = await this.db
      .select({
        branchId: schema.branches.id,
        branchName: schema.branches.name,
      })
      .from(schema.branches)
      .where(eq(schema.branches.isActive, true))
      .orderBy(asc(schema.branches.name));

    return rows;
  }

  private async getSummaryByRange(
    range: NormalizedRange,
  ): Promise<DashboardSummaryResponse> {
    const t = schema.tickets;

    const createdInRange = sql`${t.createdAt} >= ${range.from} AND ${t.createdAt} <= ${range.to}`;
    const attendedInRange = sql`${t.status} = 'FINALIZADO' AND ${t.attentionFinishedAt} IS NOT NULL AND ${t.attentionFinishedAt} >= ${range.from} AND ${t.attentionFinishedAt} <= ${range.to}`;
    const cancelledInRange = sql`${t.status} = 'CANCELADO' AND ${t.cancelledAt} IS NOT NULL AND ${t.cancelledAt} >= ${range.from} AND ${t.cancelledAt} <= ${range.to}`;

    const waitDurationFilter = sql`${attendedInRange} AND ${t.attentionStartedAt} IS NOT NULL`;
    const attentionDurationFilter = sql`${attendedInRange} AND ${t.attentionStartedAt} IS NOT NULL`;

    const rows: SummaryAggregateRow[] = await this.db
      .select({
        ticketsCreated: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${createdInRange}), 0)::int`,
        ticketsAttended: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${attendedInRange}), 0)::int`,
        ticketsCancelled: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${cancelledInRange}), 0)::int`,
        queueNow: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${t.status} IN ('PENDIENTE', 'LLAMADO', 'ESPERA')), 0)::int`,
        attendingNow: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${t.status} = 'ATENDIENDO'), 0)::int`,
        averageWaitMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionStartedAt} - ${t.createdAt})) / 60.0) FILTER (WHERE ${waitDurationFilter}), 2), 0)::float8`,
        averageAttentionMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionFinishedAt} - ${t.attentionStartedAt})) / 60.0) FILTER (WHERE ${attentionDurationFilter}), 2), 0)::float8`,
      })
      .from(t);

    const row: SummaryAggregateRow | undefined = rows[0];

    const ticketsCreated = this.toNumber(row?.ticketsCreated);
    const ticketsAttended = this.toNumber(row?.ticketsAttended);
    const ticketsCancelled = this.toNumber(row?.ticketsCancelled);
    const queueNow = this.toNumber(row?.queueNow);
    const attendingNow = this.toNumber(row?.attendingNow);
    const averageWaitMinutes = this.toNumber(row?.averageWaitMinutes);
    const averageAttentionMinutes = this.toNumber(row?.averageAttentionMinutes);

    return {
      range: this.toRangeInfo(range),
      kpis: {
        ticketsCreated,
        ticketsAttended,
        ticketsCancelled,
        queueNow,
        attendingNow,
        completionRatePct: this.calculateRate(ticketsAttended, ticketsCreated),
        cancellationRatePct: this.calculateRate(
          ticketsCancelled,
          ticketsCreated,
        ),
        averageWaitMinutes,
        averageAttentionMinutes,
      },
    };
  }

  private async getAreaByRange(
    range: NormalizedRange,
  ): Promise<DashboardAreaResponse> {
    const t = schema.tickets;
    const b = schema.branches;
    const createdBucket = sql`date_trunc('day', ${t.createdAt})`;
    const attendedBucket = sql`date_trunc('day', ${t.attentionFinishedAt})`;
    const cancelledBucket = sql`date_trunc('day', ${t.cancelledAt})`;

    const [activeBranches, createdRows, attendedRows, cancelledRows]: [
      ActiveBranchRow[],
      BranchDayTotalRow[],
      BranchDayTotalRow[],
      BranchDayTotalRow[],
    ] = await Promise.all([
      this.getActiveBranches(),
      this.db
        .select({
          branchId: b.id,
          branchName: b.name,
          day: sql<string>`to_char(${createdBucket}, 'YYYY-MM-DD')`,
          total: sql<number>`COUNT(${t.id})::int`,
        })
        .from(t)
        .innerJoin(b, eq(b.id, t.branchId))
        .where(
          and(
            eq(b.isActive, true),
            gte(t.createdAt, range.from),
            lte(t.createdAt, range.to),
          ),
        )
        .groupBy(b.id, b.name, createdBucket)
        .orderBy(asc(b.name), createdBucket),
      this.db
        .select({
          branchId: b.id,
          branchName: b.name,
          day: sql<string>`to_char(${attendedBucket}, 'YYYY-MM-DD')`,
          total: sql<number>`COUNT(${t.id})::int`,
        })
        .from(t)
        .innerJoin(b, eq(b.id, t.branchId))
        .where(
          and(
            eq(b.isActive, true),
            eq(t.status, 'FINALIZADO'),
            gte(t.attentionFinishedAt, range.from),
            lte(t.attentionFinishedAt, range.to),
          ),
        )
        .groupBy(b.id, b.name, attendedBucket)
        .orderBy(asc(b.name), attendedBucket),
      this.db
        .select({
          branchId: b.id,
          branchName: b.name,
          day: sql<string>`to_char(${cancelledBucket}, 'YYYY-MM-DD')`,
          total: sql<number>`COUNT(${t.id})::int`,
        })
        .from(t)
        .innerJoin(b, eq(b.id, t.branchId))
        .where(
          and(
            eq(b.isActive, true),
            eq(t.status, 'CANCELADO'),
            gte(t.cancelledAt, range.from),
            lte(t.cancelledAt, range.to),
          ),
        )
        .groupBy(b.id, b.name, cancelledBucket)
        .orderBy(asc(b.name), cancelledBucket),
    ]);

    const keys = this.buildDailyKeys(range.from, range.to);
    const grouped: Record<string, AreaBranchAccumulator> = {};

    for (const branch of activeBranches) {
      const branchData: AreaPointAccumulator[] = keys.map((day) => ({
        date: day,
        created: 0,
        attended: 0,
        cancelled: 0,
        completionRatePct: 0,
      }));

      grouped[branch.branchId] = {
        branchId: branch.branchId,
        branchName: branch.branchName,
        data: branchData,
      };
    }

    this.assignAreaBranchTotals(grouped, createdRows, 'created');
    this.assignAreaBranchTotals(grouped, attendedRows, 'attended');
    this.assignAreaBranchTotals(grouped, cancelledRows, 'cancelled');

    const data: DashboardAreaBranchGroup[] = [];

    for (const branch of activeBranches) {
      const group = grouped[branch.branchId];
      if (!group) continue;

      const branchPoints: DashboardAreaPoint[] = group.data.map(
        (point: AreaPointAccumulator): DashboardAreaPoint => ({
          date: point.date,
          created: point.created,
          attended: point.attended,
          cancelled: point.cancelled,
          completionRatePct: this.calculateRate(point.attended, point.created),
        }),
      );

      const branchGroup: DashboardAreaBranchGroup = {
        branchId: group.branchId,
        branchName: group.branchName,
        data: branchPoints,
      };

      data.push(branchGroup);
    }

    return {
      range: this.toRangeInfo(range),
      data,
    };
  }

  private assignAreaBranchTotals(
    grouped: Record<string, AreaBranchAccumulator>,
    rows: BranchDayTotalRow[],
    key: 'created' | 'attended' | 'cancelled',
  ): void {
    for (const row of rows) {
      const group = grouped[row.branchId];
      if (!group) continue;

      const point = group.data.find((item) => item.date === row.day);
      if (!point) continue;

      const total = this.toNumber(row.total);
      if (key === 'created') {
        point.created = total;
        continue;
      }

      if (key === 'attended') {
        point.attended = total;
        continue;
      }

      point.cancelled = total;
    }
  }

  private async getBranchesPerformanceByRange(
    range: NormalizedRange,
  ): Promise<DashboardBranchPerformanceResponse> {
    const b = schema.branches;
    const t = schema.tickets;

    const createdInRange = sql`${t.createdAt} >= ${range.from} AND ${t.createdAt} <= ${range.to}`;
    const attendedInRange = sql`${t.status} = 'FINALIZADO' AND ${t.attentionFinishedAt} IS NOT NULL AND ${t.attentionFinishedAt} >= ${range.from} AND ${t.attentionFinishedAt} <= ${range.to}`;
    const cancelledInRange = sql`${t.status} = 'CANCELADO' AND ${t.cancelledAt} IS NOT NULL AND ${t.cancelledAt} >= ${range.from} AND ${t.cancelledAt} <= ${range.to}`;

    const waitDurationFilter = sql`${attendedInRange} AND ${t.attentionStartedAt} IS NOT NULL`;
    const attentionDurationFilter = sql`${attendedInRange} AND ${t.attentionStartedAt} IS NOT NULL`;

    const rows: BranchPerformanceRow[] = await this.db
      .select({
        branchId: b.id,
        branchName: b.name,
        ticketsCreated: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${createdInRange}), 0)::int`,
        ticketsAttended: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${attendedInRange}), 0)::int`,
        ticketsCancelled: sql<number>`COALESCE(COUNT(${t.id}) FILTER (WHERE ${cancelledInRange}), 0)::int`,
        averageWaitMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionStartedAt} - ${t.createdAt})) / 60.0) FILTER (WHERE ${waitDurationFilter}), 2), 0)::float8`,
        averageAttentionMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionFinishedAt} - ${t.attentionStartedAt})) / 60.0) FILTER (WHERE ${attentionDurationFilter}), 2), 0)::float8`,
      })
      .from(b)
      .leftJoin(t, eq(t.branchId, b.id))
      .where(eq(b.isActive, true))
      .groupBy(b.id, b.name)
      .orderBy(asc(b.name));

    const data: DashboardBranchPerformanceItem[] = rows
      .map((row) => {
        const ticketsCreated = this.toNumber(row.ticketsCreated);
        const ticketsAttended = this.toNumber(row.ticketsAttended);
        const ticketsCancelled = this.toNumber(row.ticketsCancelled);

        return {
          branchId: row.branchId,
          branchName: row.branchName,
          ticketsCreated,
          ticketsAttended,
          ticketsCancelled,
          completionRatePct: this.calculateRate(
            ticketsAttended,
            ticketsCreated,
          ),
          averageWaitMinutes: this.toNumber(row.averageWaitMinutes),
          averageAttentionMinutes: this.toNumber(row.averageAttentionMinutes),
        };
      })
      .sort((left, right) => {
        if (left.ticketsAttended !== right.ticketsAttended) {
          return right.ticketsAttended - left.ticketsAttended;
        }

        return left.branchName.localeCompare(right.branchName);
      });

    const totals = data.reduce(
      (acc, row) => {
        acc.ticketsCreated += row.ticketsCreated;
        acc.ticketsAttended += row.ticketsAttended;
        acc.ticketsCancelled += row.ticketsCancelled;
        return acc;
      },
      {
        ticketsCreated: 0,
        ticketsAttended: 0,
        ticketsCancelled: 0,
      },
    );

    return {
      range: this.toRangeInfo(range),
      totals,
      data,
    };
  }

  private async getWindowsPerformanceByRange(
    range: NormalizedRange,
  ): Promise<DashboardWindowPerformanceResponse> {
    const t = schema.tickets;
    const b = schema.branches;
    const bws = schema.branchWindowServices;
    const bw = schema.branchWindows;
    const w = schema.windows;

    const [activeBranches, rows]: [ActiveBranchRow[], WindowPerformanceRow[]] =
      await Promise.all([
        this.getActiveBranches(),
        this.db
          .select({
            branchId: b.id,
            branchName: b.name,
            windowId: w.id,
            windowName: w.name,
            windowCode: w.code,
            ticketsAttended: sql<number>`COUNT(${t.id})::int`,
            averageWaitMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionStartedAt} - ${t.createdAt})) / 60.0), 2), 0)::float8`,
            averageAttentionMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionFinishedAt} - ${t.attentionStartedAt})) / 60.0), 2), 0)::float8`,
          })
          .from(t)
          .innerJoin(b, eq(b.id, t.branchId))
          .innerJoin(bws, eq(bws.id, t.branchWindowServiceId))
          .innerJoin(bw, eq(bw.id, bws.branchWindowId))
          .innerJoin(w, eq(w.id, bw.windowId))
          .where(
            and(
              eq(b.isActive, true),
              eq(t.status, 'FINALIZADO'),
              gte(t.attentionFinishedAt, range.from),
              lte(t.attentionFinishedAt, range.to),
            ),
          )
          .groupBy(b.id, b.name, w.id, w.name, w.code)
          .orderBy(asc(b.name), desc(sql`COUNT(${t.id})`), asc(w.name)),
      ]);

    const grouped: Record<string, DashboardWindowPerformanceBranchGroup> = {};

    for (const branch of activeBranches) {
      grouped[branch.branchId] = {
        branchId: branch.branchId,
        branchName: branch.branchName,
        totalAttended: 0,
        windows: [],
      };
    }

    for (const row of rows) {
      const group = grouped[row.branchId];
      if (!group) continue;

      const ticketsAttended = this.toNumber(row.ticketsAttended);
      group.totalAttended += ticketsAttended;
      group.windows.push({
        windowId: row.windowId,
        windowName: row.windowName,
        windowCode: row.windowCode,
        ticketsAttended,
        averageWaitMinutes: this.toNumber(row.averageWaitMinutes),
        averageAttentionMinutes: this.toNumber(row.averageAttentionMinutes),
      });
    }

    const data: DashboardWindowPerformanceBranchGroup[] = [];

    for (const branch of activeBranches) {
      const group = grouped[branch.branchId];
      if (!group) continue;

      const windows = [...group.windows].sort((left, right) => {
        if (left.ticketsAttended !== right.ticketsAttended) {
          return right.ticketsAttended - left.ticketsAttended;
        }

        return left.windowName.localeCompare(right.windowName);
      });

      data.push({
        branchId: group.branchId,
        branchName: group.branchName,
        totalAttended: group.totalAttended,
        windows,
      });
    }

    data.sort(
      (
        left: DashboardWindowPerformanceBranchGroup,
        right: DashboardWindowPerformanceBranchGroup,
      ): number => {
        if (left.totalAttended !== right.totalAttended) {
          return right.totalAttended - left.totalAttended;
        }

        return left.branchName.localeCompare(right.branchName);
      },
    );

    return {
      range: this.toRangeInfo(range),
      data,
    };
  }

  private async getServicesPerformanceByRange(
    range: NormalizedRange,
  ): Promise<DashboardServicePerformanceResponse> {
    const t = schema.tickets;
    const b = schema.branches;
    const s = schema.services;

    const [activeBranches, rows]: [ActiveBranchRow[], ServicePerformanceRow[]] =
      await Promise.all([
        this.getActiveBranches(),
        this.db
          .select({
            branchId: b.id,
            branchName: b.name,
            serviceId: s.id,
            serviceName: s.name,
            serviceCode: s.code,
            ticketsAttended: sql<number>`COUNT(${t.id})::int`,
            averageWaitMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionStartedAt} - ${t.createdAt})) / 60.0), 2), 0)::float8`,
            averageAttentionMinutes: sql<number>`COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (${t.attentionFinishedAt} - ${t.attentionStartedAt})) / 60.0), 2), 0)::float8`,
          })
          .from(t)
          .innerJoin(b, eq(b.id, t.branchId))
          .innerJoin(s, eq(s.id, t.serviceId))
          .where(
            and(
              eq(b.isActive, true),
              eq(t.status, 'FINALIZADO'),
              gte(t.attentionFinishedAt, range.from),
              lte(t.attentionFinishedAt, range.to),
            ),
          )
          .groupBy(b.id, b.name, s.id, s.name, s.code)
          .orderBy(asc(b.name), desc(sql`COUNT(${t.id})`), asc(s.name)),
      ]);

    const grouped: Record<string, ServiceBranchAccumulator> = {};

    for (const branch of activeBranches) {
      grouped[branch.branchId] = {
        branchId: branch.branchId,
        branchName: branch.branchName,
        totalAttended: 0,
        services: [] as ServiceItemAccumulator[],
      };
    }

    for (const row of rows) {
      const group = grouped[row.branchId];
      if (!group) continue;

      const ticketsAttended = this.toNumber(row.ticketsAttended);
      group.totalAttended += ticketsAttended;
      group.services.push({
        serviceId: row.serviceId,
        serviceName: row.serviceName,
        serviceCode: row.serviceCode,
        ticketsAttended,
        attendanceSharePct: 0,
        averageWaitMinutes: this.toNumber(row.averageWaitMinutes),
        averageAttentionMinutes: this.toNumber(row.averageAttentionMinutes),
      });
    }

    const data: DashboardServicePerformanceBranchGroup[] = [];

    for (const branch of activeBranches) {
      const group = grouped[branch.branchId];
      if (!group) continue;

      const services: DashboardServicePerformanceBranchGroup['services'] =
        group.services
          .map((service) => ({
            serviceId: service.serviceId,
            serviceName: service.serviceName,
            serviceCode: service.serviceCode,
            ticketsAttended: service.ticketsAttended,
            attendanceSharePct: this.calculateRate(
              service.ticketsAttended,
              group.totalAttended,
            ),
            averageWaitMinutes: service.averageWaitMinutes,
            averageAttentionMinutes: service.averageAttentionMinutes,
          }))
          .sort(
            (
              left: ServiceItemAccumulator,
              right: ServiceItemAccumulator,
            ): number => {
              if (left.ticketsAttended !== right.ticketsAttended) {
                return right.ticketsAttended - left.ticketsAttended;
              }

              return left.serviceName.localeCompare(right.serviceName);
            },
          );

      data.push({
        branchId: group.branchId,
        branchName: group.branchName,
        totalAttended: group.totalAttended,
        services,
      });
    }

    data.sort(
      (
        left: DashboardServicePerformanceBranchGroup,
        right: DashboardServicePerformanceBranchGroup,
      ): number => {
        if (left.totalAttended !== right.totalAttended) {
          return right.totalAttended - left.totalAttended;
        }

        return left.branchName.localeCompare(right.branchName);
      },
    );

    return {
      range: this.toRangeInfo(range),
      data,
    };
  }
}
