import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DisplayTicketRow,
  PublicDisplayTicket,
  TicketStatus,
} from './interfaces/public.interface';

@Injectable()
export class PublicService {
  private readonly DISPLAY_CALLS_LIMIT = 20;

  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getBranches() {
    return this.db.query.branches.findMany({
      where: eq(schema.branches.isActive, true),
      columns: {
        id: true,
        name: true,
        departmentName: true,
      },
      orderBy: (b, { asc }) => [asc(b.name)],
    });
  }

  async getServicesByBranch(branchId: string) {
    const rows = await this.db
      .selectDistinct({
        serviceId: schema.services.id,
        serviceName: schema.services.name,
        abbreviation: schema.services.abbreviation,
        serviceCode: schema.services.code,
      })
      .from(schema.branchWindowServices)
      .innerJoin(
        schema.branchWindows,
        eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id),
      )
      .innerJoin(
        schema.services,
        eq(schema.branchWindowServices.serviceId, schema.services.id),
      )
      .where(
        and(
          eq(schema.branchWindows.branchId, branchId),
          eq(schema.branchWindows.isActive, true),
          eq(schema.branchWindowServices.isActive, true),
          eq(schema.services.isActive, true),
        ),
      )
      .orderBy(asc(schema.services.name));

    return rows;
  }

  async getDisplayCalls(branchId: string, serviceIdsCsv: string) {
    const normalizedBranchId = branchId.trim();
    if (!normalizedBranchId) {
      throw new BadRequestException('branchId es requerido');
    }

    const serviceIds = this.parseServiceIdsCsv(serviceIdsCsv);
    if (serviceIds.length === 0) {
      throw new BadRequestException('serviceIds es requerido (CSV)');
    }

    const rows = await this.db
      .select({
        id: schema.tickets.id,
        code: schema.tickets.code,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        branchName: schema.branches.name,
        serviceId: schema.tickets.serviceId,
        serviceName: schema.services.name,
        serviceCode: schema.services.code,
        windowId: schema.windows.id,
        windowName: schema.windows.name,
        calledAt: schema.tickets.calledAt,
        createdAt: schema.tickets.createdAt,
      })
      .from(schema.tickets)
      .innerJoin(
        schema.branches,
        eq(schema.tickets.branchId, schema.branches.id),
      )
      .innerJoin(
        schema.services,
        eq(schema.tickets.serviceId, schema.services.id),
      )
      .innerJoin(
        schema.branchWindowServices,
        eq(
          schema.tickets.branchWindowServiceId,
          schema.branchWindowServices.id,
        ),
      )
      .innerJoin(
        schema.branchWindows,
        eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id),
      )
      .innerJoin(
        schema.windows,
        eq(schema.branchWindows.windowId, schema.windows.id),
      )
      .where(
        and(
          eq(schema.tickets.status, 'LLAMADO' as TicketStatus),
          eq(schema.tickets.branchId, normalizedBranchId),
          inArray(schema.tickets.serviceId, serviceIds),
        ),
      )
      .orderBy(
        sql`${schema.tickets.calledAt} DESC NULLS LAST`,
        desc(schema.tickets.createdAt),
      )
      .limit(this.DISPLAY_CALLS_LIMIT);

    return rows.map((row) => this.mapDisplayTicketRow(row));
  }

  async getDisplayTicketById(
    ticketId: string,
  ): Promise<PublicDisplayTicket | null> {
    const [row] = await this.db
      .select({
        id: schema.tickets.id,
        code: schema.tickets.code,
        type: schema.tickets.type,
        status: schema.tickets.status,
        branchId: schema.tickets.branchId,
        branchName: schema.branches.name,
        serviceId: schema.tickets.serviceId,
        serviceName: schema.services.name,
        serviceCode: schema.services.code,
        windowId: schema.windows.id,
        windowName: schema.windows.name,
        calledAt: schema.tickets.calledAt,
        createdAt: schema.tickets.createdAt,
      })
      .from(schema.tickets)
      .innerJoin(
        schema.branches,
        eq(schema.tickets.branchId, schema.branches.id),
      )
      .innerJoin(
        schema.services,
        eq(schema.tickets.serviceId, schema.services.id),
      )
      .leftJoin(
        schema.branchWindowServices,
        eq(
          schema.tickets.branchWindowServiceId,
          schema.branchWindowServices.id,
        ),
      )
      .leftJoin(
        schema.branchWindows,
        eq(schema.branchWindowServices.branchWindowId, schema.branchWindows.id),
      )
      .leftJoin(
        schema.windows,
        eq(schema.branchWindows.windowId, schema.windows.id),
      )
      .where(eq(schema.tickets.id, ticketId))
      .limit(1);

    return row ? this.mapDisplayTicketRow(row) : null;
  }

  private parseServiceIdsCsv(serviceIdsCsv: string): string[] {
    return Array.from(
      new Set(
        String(serviceIdsCsv)
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    );
  }

  private mapDisplayTicketRow(row: DisplayTicketRow): PublicDisplayTicket {
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      status: row.status,
      branchId: row.branchId,
      branchName: row.branchName,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      serviceCode: row.serviceCode,
      windowId: row.windowId ?? '',
      windowName: row.windowName ?? '',
      calledAt: row.calledAt,
      createdAt: row.createdAt,
    };
  }
}
