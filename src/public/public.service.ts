import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class PublicService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async getBranches() {
    return this.db.query.branches.findMany({
      columns: {
        id: true,
        name: true,
        departmentName: true,
      },
    });
  }

  async getServicesByBranch(branchId: string) {
    const result = await this.db.execute(sql`
      select distinct
        s.id as "serviceId",
        s.name as "serviceName",
        s.abbreviation as "abbreviation",
        s.code as "serviceCode"
      from ${schema.branchWindowServices} bws
      inner join ${schema.services} s on s.id = bws.service_id
      where bws.branch_id = ${branchId}
      order by s.name asc
    `);

    return (result.rows as unknown[]).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        serviceId: String(row.serviceId),
        serviceName: String(row.serviceName),
        abbreviation: String(row.abbreviation),
        serviceCode: String(row.serviceCode),
      };
    });
  }
}
