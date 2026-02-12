import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class PublicService {
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
}
