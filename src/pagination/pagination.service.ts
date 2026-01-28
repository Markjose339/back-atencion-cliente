import { Injectable } from '@nestjs/common';
import { PaginationMeta } from './interfaces/pagination.interface';

@Injectable()
export class PaginationService {
  builPaginationMeta(
    total: number,
    page: number,
    limit: number,
    dataLength: number,
  ): PaginationMeta {
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    return {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      from: skip + 1,
      to: skip + dataLength,
    };
  }
  calulateSkip(page: number, limit: number): number {
    return (page - 1) * limit;
  }

  validatePaginationParams(params: { page?: number; limit?: number }): {
    page: number;
    limit: number;
  } {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(Math.max(1, params.limit || 10), 100);
    return { page, limit };
  }
}
