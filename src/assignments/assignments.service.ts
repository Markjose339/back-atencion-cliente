import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { DB_CONN } from '@/database/db.conn';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { schema } from '@/database/schema';
import { PaginationService } from '@/pagination/pagination.service';
import { PaginationDto } from '@/pagination/dto/pagination.dto';
import { BranchesService } from '@/branches/branches.service';
import { WindowsService } from '@/windows/windows.service';
import { UsersService } from '@/users/users.service';
import { ServicesService } from '@/services/services.service';
import { and, count, eq, ilike, or } from 'drizzle-orm';

type AssignmentIds = {
  branchId: string;
  windowId: string;
  serviceId: string;
  userId: string;
};

type AssignmentRecord = AssignmentIds & { id: string };

@Injectable()
export class AssignmentsService extends PaginationService {
  constructor(
    @Inject(DB_CONN)
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly branchesService: BranchesService,
    private readonly windowsService: WindowsService,
    private readonly usersService: UsersService,
    private readonly servicesService: ServicesService,
  ) {
    super();
  }

  async create(createAssignmentDto: CreateAssignmentDto) {
    const { branchId, windowId, serviceId, userId } = createAssignmentDto;

    await Promise.all([
      this.branchesService.validateBranchId(branchId),
      this.windowsService.validateWindowId(windowId),
      this.servicesService.validateServiceId(serviceId),
      this.usersService.validatedUserId(userId),
      this.validateAssignmentUnique({ branchId, windowId, serviceId, userId }),
    ]);

    const [assignment] = await this.db
      .insert(schema.branchWindowServices)
      .values({
        branchId,
        windowId,
        serviceId,
        userId,
      })
      .returning({
        id: schema.branchWindowServices.id,
      });

    return this.getAssignmentById(assignment.id);
  }

  async findAll(paginationDto: PaginationDto) {
    const { page, limit } = this.validatePaginationParams(paginationDto);
    const { search } = paginationDto;
    const offset = this.calulateSkip(page, limit);

    const bws = schema.branchWindowServices;
    const b = schema.branches;
    const w = schema.windows;
    const s = schema.services;
    const u = schema.users;

    const where = search
      ? or(
          ilike(b.name, `%${search}%`),
          ilike(w.name, `%${search}%`),
          ilike(s.name, `%${search}%`),
          ilike(s.abbreviation, `%${search}%`),
          ilike(u.name, `%${search}%`),
        )
      : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: bws.id,

          branch: {
            id: b.id,
            name: b.name,
          },
          window: {
            id: w.id,
            name: w.name,
          },
          service: {
            id: s.id,
            name: s.name,
            abbreviation: s.abbreviation,
            code: s.code,
          },
          user: {
            id: u.id,
            name: u.name,
            email: u.email,
          },
        })
        .from(bws)
        .leftJoin(b, eq(b.id, bws.branchId))
        .leftJoin(w, eq(w.id, bws.windowId))
        .leftJoin(s, eq(s.id, bws.serviceId))
        .leftJoin(u, eq(u.id, bws.userId))
        .where(where)
        .limit(limit)
        .offset(offset),

      this.db
        .select({ value: count() })
        .from(bws)
        .leftJoin(b, eq(b.id, bws.branchId))
        .leftJoin(w, eq(w.id, bws.windowId))
        .leftJoin(s, eq(s.id, bws.serviceId))
        .leftJoin(u, eq(u.id, bws.userId))
        .where(where),
    ]);

    const meta = this.builPaginationMeta(total, page, limit, rows.length);

    return { data: rows, meta };
  }

  async findOne(id: string) {
    return this.getAssignmentById(id);
  }

  async update(id: string, updateAssignmentDto: UpdateAssignmentDto) {
    const current = await this.validateAssignmentId(id);

    const nextIds: AssignmentIds = {
      branchId: updateAssignmentDto.branchId ?? current.branchId,
      windowId: updateAssignmentDto.windowId ?? current.windowId,
      serviceId: updateAssignmentDto.serviceId ?? current.serviceId,
      userId: updateAssignmentDto.userId ?? current.userId,
    };

    const validations: Promise<void>[] = [];

    if (updateAssignmentDto.branchId) {
      validations.push(
        this.branchesService
          .validateBranchId(updateAssignmentDto.branchId)
          .then(() => undefined),
      );
    }

    if (updateAssignmentDto.windowId) {
      validations.push(
        this.windowsService
          .validateWindowId(updateAssignmentDto.windowId)
          .then(() => undefined),
      );
    }

    if (updateAssignmentDto.serviceId) {
      validations.push(
        this.servicesService
          .validateServiceId(updateAssignmentDto.serviceId)
          .then(() => undefined),
      );
    }

    if (updateAssignmentDto.userId) {
      validations.push(
        this.usersService
          .validatedUserId(updateAssignmentDto.userId)
          .then(() => undefined),
      );
    }

    if (!this.isSameAssignment(nextIds, current)) {
      validations.push(this.validateAssignmentUnique(nextIds, id));
    }

    await Promise.all(validations);

    await this.db
      .update(schema.branchWindowServices)
      .set(nextIds)
      .where(eq(schema.branchWindowServices.id, id));

    return this.getAssignmentById(id);
  }

  async remove(id: string) {
    const assignment = await this.getAssignmentById(id);

    await this.db
      .delete(schema.branchWindowServices)
      .where(eq(schema.branchWindowServices.id, id));

    return assignment;
  }

  private async validateAssignmentId(id: string): Promise<AssignmentRecord> {
    const assignment = await this.db.query.branchWindowServices.findFirst({
      where: eq(schema.branchWindowServices.id, id),
      columns: {
        id: true,
        branchId: true,
        windowId: true,
        serviceId: true,
        userId: true,
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Asignacion con el id ${id} no encontrada`);
    }

    return assignment;
  }

  private async validateAssignmentUnique(
    ids: AssignmentIds,
    excludeId?: string,
  ) {
    const assignment = await this.db.query.branchWindowServices.findFirst({
      where: and(
        eq(schema.branchWindowServices.branchId, ids.branchId),
        eq(schema.branchWindowServices.windowId, ids.windowId),
        eq(schema.branchWindowServices.serviceId, ids.serviceId),
        eq(schema.branchWindowServices.userId, ids.userId),
      ),
      columns: {
        id: true,
      },
    });

    if (assignment && (!excludeId || assignment.id !== excludeId)) {
      throw new ConflictException(
        'La asignacion ya existe para esa sucursal, ventana, servicio y usuario',
      );
    }
  }

  private async getAssignmentById(id: string) {
    const assignment = await this.db.query.branchWindowServices.findFirst({
      where: eq(schema.branchWindowServices.id, id),
      columns: {
        id: true,
        branchId: true,
        windowId: true,
        serviceId: true,
        userId: true,
      },
      with: {
        branch: {
          columns: {
            id: true,
            name: true,
          },
        },
        window: {
          columns: {
            id: true,
            name: true,
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
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException(`Asignacion con el id ${id} no encontrada`);
    }

    return this.mapAssignment(assignment);
  }

  private mapAssignment(assignment: {
    id: string;
    branchId: string;
    windowId: string;
    serviceId: string;
    userId: string;
    branch?: { id: string; name: string } | null;
    window?: { id: string; name: string } | null;
    service?: {
      id: string;
      name: string;
      abbreviation: string;
      code: string;
    } | null;
    user?: { id: string; name: string; email: string } | null;
  }) {
    if (
      !assignment.branch ||
      !assignment.window ||
      !assignment.service ||
      !assignment.user
    ) {
      throw new NotFoundException(
        'Asignacion incompleta: faltan datos de sucursal, ventana, servicio o usuario',
      );
    }

    return {
      id: assignment.id,
      branch: assignment.branch,
      window: assignment.window,
      service: assignment.service,
      user: assignment.user,
    };
  }

  private isSameAssignment(a: AssignmentIds, b: AssignmentIds) {
    return (
      a.branchId === b.branchId &&
      a.windowId === b.windowId &&
      a.serviceId === b.serviceId &&
      a.userId === b.userId
    );
  }
}
