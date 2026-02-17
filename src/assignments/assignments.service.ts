// assignments.service.ts
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, eq, ilike, or } from 'drizzle-orm';

import { CreateWindowServiceDto } from './dto/create-window-service.dto';
import { UpdateWindowServiceDto } from './dto/update-window-service.dto';
import { CreateOperatorAssignmentDto } from './dto/create-operator-assignment.dto';
import { UpdateOperatorAssignmentDto } from './dto/update-operator-assignment.dto';

@Injectable()
export class AssignmentsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {
    super();
  }

  private async ensureBranchWindow(branchId: string, windowId: string) {
    const existing = await this.db.query.branchWindows.findFirst({
      where: and(
        eq(schema.branchWindows.branchId, branchId),
        eq(schema.branchWindows.windowId, windowId),
      ),
      columns: { id: true },
    });

    if (existing) return existing.id;

    const [created] = await this.db
      .insert(schema.branchWindows)
      .values({ branchId, windowId })
      .returning({ id: schema.branchWindows.id });

    return created.id;
  }

  async createWindowService(dto: CreateWindowServiceDto) {
    const branchWindowId = await this.ensureBranchWindow(
      dto.branchId,
      dto.windowId,
    );

    const exists = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.branchWindowId, branchWindowId),
        eq(schema.branchWindowServices.serviceId, dto.serviceId),
      ),
      columns: { id: true },
    });

    if (exists) {
      throw new ConflictException(
        'El servicio ya está asignado a esa ventanilla en esa sucursal',
      );
    }

    const [row] = await this.db
      .insert(schema.branchWindowServices)
      .values({
        branchWindowId,
        serviceId: dto.serviceId,
        isActive: dto.isActive ?? true,
      })
      .returning({ id: schema.branchWindowServices.id });

    return this.getWindowServiceById(row.id);
  }

  async listWindowServices(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const offset = this.calulateSkip(page, limit);

    const bws = schema.branchWindowServices;
    const bw = schema.branchWindows;
    const b = schema.branches;
    const w = schema.windows;
    const s = schema.services;

    const where = search
      ? or(
          ilike(b.name, `%${search}%`),
          ilike(w.name, `%${search}%`),
          ilike(w.code, `%${search}%`),
          ilike(s.name, `%${search}%`),
          ilike(s.abbreviation, `%${search}%`),
          ilike(s.code, `%${search}%`),
        )
      : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: bws.id,
          isActive: bws.isActive,
          branch: { id: b.id, name: b.name },
          window: { id: w.id, name: w.name, code: w.code },
          service: {
            id: s.id,
            name: s.name,
            abbreviation: s.abbreviation,
            code: s.code,
          },
        })
        .from(bws)
        .innerJoin(bw, eq(bw.id, bws.branchWindowId))
        .innerJoin(b, eq(b.id, bw.branchId))
        .innerJoin(w, eq(w.id, bw.windowId))
        .innerJoin(s, eq(s.id, bws.serviceId))
        .where(where)
        .limit(limit)
        .offset(offset),

      this.db
        .select({ value: count() })
        .from(bws)
        .innerJoin(bw, eq(bw.id, bws.branchWindowId))
        .innerJoin(b, eq(b.id, bw.branchId))
        .innerJoin(w, eq(w.id, bw.windowId))
        .innerJoin(s, eq(s.id, bws.serviceId))
        .where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, rows.length);
    return { data: rows, meta };
  }

  async getWindowServiceById(id: string) {
    const bws = await this.db.query.branchWindowServices.findFirst({
      where: eq(schema.branchWindowServices.id, id),
      columns: { id: true, isActive: true },
      with: {
        branchWindow: {
          columns: { id: true },
          with: {
            branch: { columns: { id: true, name: true } },
            window: { columns: { id: true, name: true, code: true } },
          },
        },
        service: {
          columns: {
            id: true,
            name: true,
            abbreviation: true,
            code: true,
          },
        },
      },
    });

    if (
      !bws ||
      !bws.branchWindow?.branch ||
      !bws.branchWindow?.window ||
      !bws.service
    ) {
      throw new NotFoundException(
        `Asignación (window-service) con id ${id} no encontrada`,
      );
    }

    return {
      id: bws.id,
      isActive: bws.isActive,
      branch: bws.branchWindow.branch,
      window: bws.branchWindow.window,
      service: bws.service,
    };
  }

  async updateWindowService(id: string, dto: UpdateWindowServiceDto) {
    await this.getWindowServiceById(id);

    await this.db
      .update(schema.branchWindowServices)
      .set({ isActive: dto.isActive })
      .where(eq(schema.branchWindowServices.id, id));

    return this.getWindowServiceById(id);
  }

  async deleteWindowService(id: string) {
    const row = await this.getWindowServiceById(id);

    await this.db
      .delete(schema.branchWindowServices)
      .where(eq(schema.branchWindowServices.id, id));

    return row;
  }

  async createOperatorAssignment(dto: CreateOperatorAssignmentDto) {
    const branchWindowId = await this.ensureBranchWindow(
      dto.branchId,
      dto.windowId,
    );

    const exists = await this.db.query.userBranchWindows.findFirst({
      where: and(
        eq(schema.userBranchWindows.userId, dto.userId),
        eq(schema.userBranchWindows.branchId, dto.branchId),
      ),
      columns: { id: true },
    });

    if (exists) {
      throw new ConflictException(
        'El usuario ya tiene una ventanilla asignada en esta sucursal',
      );
    }

    const [row] = await this.db
      .insert(schema.userBranchWindows)
      .values({
        userId: dto.userId,
        branchId: dto.branchId,
        branchWindowId,
        isActive: dto.isActive ?? true,
      })
      .returning({ id: schema.userBranchWindows.id });

    return this.getOperatorAssignmentById(row.id);
  }

  async listOperatorAssignments(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const offset = this.calulateSkip(page, limit);

    const ubw = schema.userBranchWindows;
    const bw = schema.branchWindows;
    const b = schema.branches;
    const w = schema.windows;
    const u = schema.users;

    const where = search
      ? or(
          ilike(b.name, `%${search}%`),
          ilike(w.name, `%${search}%`),
          ilike(w.code, `%${search}%`),
          ilike(u.name, `%${search}%`),
          ilike(u.email, `%${search}%`),
        )
      : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: ubw.id,
          isActive: ubw.isActive,
          branch: { id: b.id, name: b.name },
          window: { id: w.id, name: w.name, code: w.code },
          user: { id: u.id, name: u.name, email: u.email },
        })
        .from(ubw)
        .innerJoin(bw, eq(bw.id, ubw.branchWindowId))
        .innerJoin(b, eq(b.id, ubw.branchId))
        .innerJoin(w, eq(w.id, bw.windowId))
        .innerJoin(u, eq(u.id, ubw.userId))
        .where(where)
        .limit(limit)
        .offset(offset),

      this.db
        .select({ value: count() })
        .from(ubw)
        .innerJoin(bw, eq(bw.id, ubw.branchWindowId))
        .innerJoin(b, eq(b.id, ubw.branchId))
        .innerJoin(w, eq(w.id, bw.windowId))
        .innerJoin(u, eq(u.id, ubw.userId))
        .where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, rows.length);
    return { data: rows, meta };
  }

  async getOperatorAssignmentById(id: string) {
    const ubw = await this.db.query.userBranchWindows.findFirst({
      where: eq(schema.userBranchWindows.id, id),
      columns: { id: true, isActive: true },
      with: {
        user: { columns: { id: true, name: true, email: true } },
        branch: { columns: { id: true, name: true } },
        branchWindow: {
          columns: { id: true },
          with: {
            window: { columns: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!ubw || !ubw.user || !ubw.branch || !ubw.branchWindow?.window) {
      throw new NotFoundException(
        `Asignación (operador) con id ${id} no encontrada`,
      );
    }

    return {
      id: ubw.id,
      isActive: ubw.isActive,
      user: ubw.user,
      branch: ubw.branch,
      window: ubw.branchWindow.window,
    };
  }

  async updateOperatorAssignment(id: string, dto: UpdateOperatorAssignmentDto) {
    await this.getOperatorAssignmentById(id);

    await this.db
      .update(schema.userBranchWindows)
      .set({ isActive: dto.isActive })
      .where(eq(schema.userBranchWindows.id, id));

    return this.getOperatorAssignmentById(id);
  }

  async deleteOperatorAssignment(id: string) {
    const row = await this.getOperatorAssignmentById(id);

    await this.db
      .delete(schema.userBranchWindows)
      .where(eq(schema.userBranchWindows.id, id));

    return row;
  }
}
