// assignments.service.ts
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { DB_CONN } from '@/database/db.conn';
import { schema } from '@/database/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, count, eq, ilike, inArray, or } from 'drizzle-orm';

import { CreateWindowServiceDto } from './dto/create-window-service.dto';
import { UpdateWindowServiceDto } from './dto/update-window-service.dto';
import { CreateOperatorAssignmentDto } from './dto/create-operator-assignment.dto';
import { UpdateOperatorAssignmentDto } from './dto/update-operator-assignment.dto';
import { SyncWindowServicesDto } from './dto/sync-window-services.dto';
import { SyncOperatorAssignmentsDto } from './dto/sync-operator-assignments.dto';

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

  private async getBranchWindowId(branchId: string, windowId: string) {
    const row = await this.db.query.branchWindows.findFirst({
      where: and(
        eq(schema.branchWindows.branchId, branchId),
        eq(schema.branchWindows.windowId, windowId),
        eq(schema.branchWindows.isActive, true),
      ),
      columns: { id: true },
    });

    if (!row) {
      throw new NotFoundException(
        'La ventanilla no esta habilitada para la sucursal seleccionada',
      );
    }

    return row.id;
  }

  private async validateBranchId(branchId: string) {
    const branch = await this.db.query.branches.findFirst({
      where: eq(schema.branches.id, branchId),
      columns: { id: true },
    });

    if (!branch) {
      throw new NotFoundException(`Sucursal con id ${branchId} no encontrada`);
    }
  }

  private async validateWindowId(windowId: string) {
    const window = await this.db.query.windows.findFirst({
      where: eq(schema.windows.id, windowId),
      columns: { id: true },
    });

    if (!window) {
      throw new NotFoundException(
        `Ventanilla con id ${windowId} no encontrada`,
      );
    }
  }

  private async validateWindowIds(windowIds: string[]) {
    if (windowIds.length === 0) return;

    const rows = await this.db
      .select({ id: schema.windows.id })
      .from(schema.windows)
      .where(inArray(schema.windows.id, windowIds));

    if (rows.length !== windowIds.length) {
      throw new NotFoundException('Una o mas ventanillas no existen');
    }
  }

  private async validateServiceIds(serviceIds: string[]) {
    if (serviceIds.length === 0) return;

    const services = await this.db
      .select({ id: schema.services.id })
      .from(schema.services)
      .where(inArray(schema.services.id, serviceIds));

    if (services.length !== serviceIds.length) {
      throw new NotFoundException('Uno o mas servicios no existen');
    }
  }

  private async validateUserIds(userIds: string[]) {
    if (userIds.length === 0) return;

    const users = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));

    if (users.length !== userIds.length) {
      throw new NotFoundException('Uno o mas usuarios no existen');
    }
  }

  async createWindowService(dto: CreateWindowServiceDto) {
    const uniqueServiceIds = [
      ...new Set(dto.serviceIds.map((serviceId) => serviceId.trim())),
    ];

    await Promise.all([
      this.validateBranchId(dto.branchId),
      this.validateWindowId(dto.windowId),
      this.validateServiceIds(uniqueServiceIds),
    ]);

    const branchWindowId = await this.ensureBranchWindow(
      dto.branchId,
      dto.windowId,
    );

    const existing = await this.db
      .select({ serviceId: schema.branchWindowServices.serviceId })
      .from(schema.branchWindowServices)
      .where(
        and(
          eq(schema.branchWindowServices.branchWindowId, branchWindowId),
          inArray(schema.branchWindowServices.serviceId, uniqueServiceIds),
        ),
      );

    const existingServiceIds = new Set(
      existing.map((assignment) => assignment.serviceId),
    );

    const serviceIdsToInsert = uniqueServiceIds.filter(
      (serviceId) => !existingServiceIds.has(serviceId),
    );

    if (serviceIdsToInsert.length > 0) {
      await this.db.insert(schema.branchWindowServices).values(
        serviceIdsToInsert.map((serviceId) => ({
          branchWindowId,
          serviceId,
          isActive: dto.isActive ?? true,
        })),
      );
    }

    const rows = await this.db
      .select({
        id: schema.branchWindowServices.id,
        isActive: schema.branchWindowServices.isActive,
        service: {
          id: schema.services.id,
          name: schema.services.name,
          abbreviation: schema.services.abbreviation,
          code: schema.services.code,
        },
      })
      .from(schema.branchWindowServices)
      .innerJoin(
        schema.services,
        eq(schema.services.id, schema.branchWindowServices.serviceId),
      )
      .where(
        and(
          eq(schema.branchWindowServices.branchWindowId, branchWindowId),
          inArray(schema.branchWindowServices.serviceId, uniqueServiceIds),
        ),
      );

    const rowsByServiceId = new Map(rows.map((row) => [row.service.id, row]));

    const assigned = serviceIdsToInsert
      .map((serviceId) => rowsByServiceId.get(serviceId))
      .filter((row): row is (typeof rows)[number] => row !== undefined);

    const alreadyAssigned = uniqueServiceIds
      .filter((serviceId) => existingServiceIds.has(serviceId))
      .map((serviceId) => rowsByServiceId.get(serviceId))
      .filter((row): row is (typeof rows)[number] => row !== undefined);

    return {
      branchId: dto.branchId,
      windowId: dto.windowId,
      assigned,
      alreadyAssigned,
      summary: {
        requested: uniqueServiceIds.length,
        assigned: assigned.length,
        alreadyAssigned: alreadyAssigned.length,
      },
    };
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
        `Asignacion (window-service) con id ${id} no encontrada`,
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
    await Promise.all([
      this.validateBranchId(dto.branchId),
      this.validateWindowId(dto.windowId),
    ]);

    const branchWindowId = await this.getBranchWindowId(
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

  async listBranchWindows(branchId: string) {
    await this.validateBranchId(branchId);

    const data = await this.db
      .select({
        branchWindowId: schema.branchWindows.id,
        window: {
          id: schema.windows.id,
          name: schema.windows.name,
          code: schema.windows.code,
        },
      })
      .from(schema.branchWindows)
      .innerJoin(
        schema.windows,
        eq(schema.windows.id, schema.branchWindows.windowId),
      )
      .where(
        and(
          eq(schema.branchWindows.branchId, branchId),
          eq(schema.branchWindows.isActive, true),
          eq(schema.windows.isActive, true),
        ),
      )
      .orderBy(asc(schema.windows.name));

    return { branchId, data };
  }

  async getBranchConfig(branchId: string) {
    await this.validateBranchId(branchId);

    const [branch, windows, services, branchWindows, activeWindowServices] =
      await Promise.all([
        this.db.query.branches.findFirst({
          where: eq(schema.branches.id, branchId),
          columns: { id: true, name: true },
        }),
        this.db
          .select({
            id: schema.windows.id,
            name: schema.windows.name,
            code: schema.windows.code,
          })
          .from(schema.windows)
          .where(eq(schema.windows.isActive, true))
          .orderBy(asc(schema.windows.name)),
        this.db
          .select({
            id: schema.services.id,
            name: schema.services.name,
            abbreviation: schema.services.abbreviation,
            code: schema.services.code,
          })
          .from(schema.services)
          .where(eq(schema.services.isActive, true))
          .orderBy(asc(schema.services.name)),
        this.db
          .select({
            id: schema.branchWindows.id,
            windowId: schema.branchWindows.windowId,
            isActive: schema.branchWindows.isActive,
          })
          .from(schema.branchWindows)
          .where(eq(schema.branchWindows.branchId, branchId)),
        this.db
          .select({
            branchWindowId: schema.branchWindowServices.branchWindowId,
            serviceId: schema.branchWindowServices.serviceId,
          })
          .from(schema.branchWindowServices)
          .innerJoin(
            schema.branchWindows,
            eq(
              schema.branchWindows.id,
              schema.branchWindowServices.branchWindowId,
            ),
          )
          .where(
            and(
              eq(schema.branchWindows.branchId, branchId),
              eq(schema.branchWindows.isActive, true),
              eq(schema.branchWindowServices.isActive, true),
            ),
          ),
      ]);

    const branchWindowIdByWindowId = new Map(
      branchWindows.map((row) => [row.windowId, row.id]),
    );
    const windowIdByBranchWindowId = new Map(
      branchWindows.map((row) => [row.id, row.windowId]),
    );

    const activeByWindowId = new Map<string, Set<string>>();

    for (const row of activeWindowServices) {
      const windowId = windowIdByBranchWindowId.get(row.branchWindowId);
      if (!windowId) continue;

      const currentSet = activeByWindowId.get(windowId) ?? new Set<string>();
      currentSet.add(row.serviceId);
      activeByWindowId.set(windowId, currentSet);
    }

    const windowConfigs = windows.map((window) => ({
      branchWindowId: branchWindowIdByWindowId.get(window.id) ?? null,
      window,
      serviceIds: [...(activeByWindowId.get(window.id) ?? new Set<string>())],
    }));

    const [operatorAssignments, operatorsCatalog] = await Promise.all([
      this.db
        .select({
          id: schema.userBranchWindows.id,
          isActive: schema.userBranchWindows.isActive,
          user: {
            id: schema.users.id,
            name: schema.users.name,
            email: schema.users.email,
            isActive: schema.users.isActive,
          },
          window: {
            id: schema.windows.id,
            name: schema.windows.name,
            code: schema.windows.code,
          },
        })
        .from(schema.userBranchWindows)
        .innerJoin(
          schema.branchWindows,
          eq(schema.branchWindows.id, schema.userBranchWindows.branchWindowId),
        )
        .innerJoin(
          schema.windows,
          eq(schema.windows.id, schema.branchWindows.windowId),
        )
        .innerJoin(
          schema.users,
          eq(schema.users.id, schema.userBranchWindows.userId),
        )
        .where(eq(schema.userBranchWindows.branchId, branchId))
        .orderBy(asc(schema.users.name)),
      this.db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.users)
        .where(eq(schema.users.isActive, true))
        .orderBy(asc(schema.users.name)),
    ]);

    return {
      branch: branch ?? { id: branchId, name: '' },
      services,
      windows: windowConfigs,
      operatorAssignments,
      operatorsCatalog,
    };
  }

  async syncWindowServices(dto: SyncWindowServicesDto) {
    await this.validateBranchId(dto.branchId);

    const desiredByWindowId = new Map<string, Set<string>>();

    for (const row of dto.windowServices) {
      const windowId = row.windowId.trim();
      const serviceSet = desiredByWindowId.get(windowId) ?? new Set<string>();

      for (const rawServiceId of row.serviceIds) {
        serviceSet.add(rawServiceId.trim());
      }

      desiredByWindowId.set(windowId, serviceSet);
    }

    const windowIds = [...desiredByWindowId.keys()];
    const serviceIds = [
      ...new Set(
        [...desiredByWindowId.values()].flatMap((serviceSet) => [
          ...serviceSet.values(),
        ]),
      ),
    ];

    await Promise.all([
      this.validateWindowIds(windowIds),
      this.validateServiceIds(serviceIds),
    ]);

    const existingBranchWindows = await this.db
      .select({
        id: schema.branchWindows.id,
        windowId: schema.branchWindows.windowId,
      })
      .from(schema.branchWindows)
      .where(eq(schema.branchWindows.branchId, dto.branchId));

    const branchWindowIdByWindowId = new Map(
      existingBranchWindows.map((row) => [row.windowId, row.id]),
    );

    const windowIdsToLink = windowIds.filter(
      (windowId) =>
        !branchWindowIdByWindowId.has(windowId) &&
        (desiredByWindowId.get(windowId)?.size ?? 0) > 0,
    );

    for (const windowId of windowIdsToLink) {
      const branchWindowId = await this.ensureBranchWindow(
        dto.branchId,
        windowId,
      );
      branchWindowIdByWindowId.set(windowId, branchWindowId);
    }

    const desiredPairs = new Map<
      string,
      { branchWindowId: string; serviceId: string }
    >();

    for (const [windowId, serviceSet] of desiredByWindowId.entries()) {
      const branchWindowId = branchWindowIdByWindowId.get(windowId);
      if (!branchWindowId) continue;

      for (const serviceId of serviceSet.values()) {
        desiredPairs.set(`${branchWindowId}:${serviceId}`, {
          branchWindowId,
          serviceId,
        });
      }
    }

    const existingAssignments = await this.db
      .select({
        id: schema.branchWindowServices.id,
        branchWindowId: schema.branchWindowServices.branchWindowId,
        serviceId: schema.branchWindowServices.serviceId,
        isActive: schema.branchWindowServices.isActive,
      })
      .from(schema.branchWindowServices)
      .innerJoin(
        schema.branchWindows,
        eq(schema.branchWindows.id, schema.branchWindowServices.branchWindowId),
      )
      .where(eq(schema.branchWindows.branchId, dto.branchId));

    const existingByPairKey = new Map(
      existingAssignments.map((row) => [
        `${row.branchWindowId}:${row.serviceId}`,
        row,
      ]),
    );

    const toInsert = [...desiredPairs.entries()]
      .filter(([pairKey]) => !existingByPairKey.has(pairKey))
      .map(([, row]) => row);

    const toActivateIds = [...desiredPairs.entries()]
      .map(([pairKey]) => existingByPairKey.get(pairKey))
      .filter((row): row is (typeof existingAssignments)[number] => !!row)
      .filter((row) => row.isActive === false)
      .map((row) => row.id);

    const toDeleteIds = existingAssignments
      .filter(
        (row) => !desiredPairs.has(`${row.branchWindowId}:${row.serviceId}`),
      )
      .map((row) => row.id);

    await this.db.transaction(async (tx) => {
      if (toInsert.length > 0) {
        await tx.insert(schema.branchWindowServices).values(
          toInsert.map((row) => ({
            branchWindowId: row.branchWindowId,
            serviceId: row.serviceId,
            isActive: true,
          })),
        );
      }

      if (toActivateIds.length > 0) {
        await tx
          .update(schema.branchWindowServices)
          .set({ isActive: true })
          .where(inArray(schema.branchWindowServices.id, toActivateIds));
      }

      if (toDeleteIds.length > 0) {
        await tx
          .delete(schema.branchWindowServices)
          .where(inArray(schema.branchWindowServices.id, toDeleteIds));
      }
    });

    return {
      branchId: dto.branchId,
      summary: {
        requested: desiredPairs.size,
        created: toInsert.length,
        activated: toActivateIds.length,
        deleted: toDeleteIds.length,
        unchanged: desiredPairs.size - toInsert.length - toActivateIds.length,
      },
    };
  }

  async syncOperatorAssignments(dto: SyncOperatorAssignmentsDto) {
    await this.validateBranchId(dto.branchId);

    const desiredByUserId = new Map<
      string,
      { userId: string; windowId: string; isActive: boolean }
    >();

    for (const row of dto.assignments) {
      const userId = row.userId.trim();

      if (desiredByUserId.has(userId)) {
        throw new BadRequestException(
          `El usuario ${userId} esta repetido en la lista de asignaciones`,
        );
      }

      desiredByUserId.set(userId, {
        userId,
        windowId: row.windowId.trim(),
        isActive: row.isActive ?? true,
      });
    }

    const userIds = [...desiredByUserId.keys()];
    const windowIds = [
      ...new Set([...desiredByUserId.values()].map((row) => row.windowId)),
    ];

    await Promise.all([
      this.validateUserIds(userIds),
      this.validateWindowIds(windowIds),
    ]);

    const branchWindowIds = await Promise.all(
      windowIds.map(async (windowId) => ({
        windowId,
        branchWindowId: await this.ensureBranchWindow(dto.branchId, windowId),
      })),
    );

    const branchWindowIdByWindowId = new Map(
      branchWindowIds.map((row) => [row.windowId, row.branchWindowId]),
    );

    const existingAssignments = await this.db
      .select({
        id: schema.userBranchWindows.id,
        userId: schema.userBranchWindows.userId,
        branchWindowId: schema.userBranchWindows.branchWindowId,
        isActive: schema.userBranchWindows.isActive,
      })
      .from(schema.userBranchWindows)
      .where(eq(schema.userBranchWindows.branchId, dto.branchId));

    const existingByUserId = new Map(
      existingAssignments.map((row) => [row.userId, row]),
    );

    const toCreate: Array<{
      userId: string;
      branchWindowId: string;
      isActive: boolean;
    }> = [];

    const toUpdate: Array<{
      id: string;
      branchWindowId: string;
      isActive: boolean;
    }> = [];

    for (const row of desiredByUserId.values()) {
      const branchWindowId = branchWindowIdByWindowId.get(row.windowId);
      if (!branchWindowId) continue;

      const existing = existingByUserId.get(row.userId);
      if (!existing) {
        toCreate.push({
          userId: row.userId,
          branchWindowId,
          isActive: row.isActive,
        });
        continue;
      }

      if (
        existing.branchWindowId !== branchWindowId ||
        existing.isActive !== row.isActive
      ) {
        toUpdate.push({
          id: existing.id,
          branchWindowId,
          isActive: row.isActive,
        });
      }
    }

    const toDeleteIds = existingAssignments
      .filter((row) => !desiredByUserId.has(row.userId))
      .map((row) => row.id);

    await this.db.transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.insert(schema.userBranchWindows).values(
          toCreate.map((row) => ({
            userId: row.userId,
            branchId: dto.branchId,
            branchWindowId: row.branchWindowId,
            isActive: row.isActive,
          })),
        );
      }

      if (toUpdate.length > 0) {
        for (const row of toUpdate) {
          await tx
            .update(schema.userBranchWindows)
            .set({
              branchWindowId: row.branchWindowId,
              isActive: row.isActive,
            })
            .where(eq(schema.userBranchWindows.id, row.id));
        }
      }

      if (toDeleteIds.length > 0) {
        await tx
          .delete(schema.userBranchWindows)
          .where(inArray(schema.userBranchWindows.id, toDeleteIds));
      }
    });

    return {
      branchId: dto.branchId,
      summary: {
        requested: desiredByUserId.size,
        created: toCreate.length,
        updated: toUpdate.length,
        deleted: toDeleteIds.length,
        unchanged: desiredByUserId.size - toCreate.length - toUpdate.length,
      },
    };
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
        `Asignacion (operador) con id ${id} no encontrada`,
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
