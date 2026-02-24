import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MulterError } from 'multer';
import { ADVERTISEMENT_MAX_FILE_SIZE_BYTES } from '../constants/advertisement.constants';

type ErrorPayload = {
  statusCode: number;
  code: string;
  message: string;
  details: string | string[];
  path: string;
  timestamp: string;
};

@Catch()
export class AdvertisementUploadExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof MulterError) {
      const { statusCode, code, message } = this.fromMulterError(exception);
      const payload: ErrorPayload = {
        statusCode,
        code,
        message,
        details: exception.message,
        path: request.url,
        timestamp: new Date().toISOString(),
      };

      response.status(statusCode).json(payload);
      return;
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const details = this.extractHttpDetails(exceptionResponse);
      const message = this.extractHttpMessage(
        exceptionResponse,
        exception.message,
      );
      const payload: ErrorPayload = {
        statusCode,
        code: this.httpStatusToCode(statusCode),
        message,
        details,
        path: request.url,
        timestamp: new Date().toISOString(),
      };

      response.status(statusCode).json(payload);
      return;
    }

    const fallbackPayload: ErrorPayload = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'UPLOAD_INTERNAL_ERROR',
      message: 'Error interno al subir el archivo',
      details:
        exception instanceof Error ? exception.message : 'Error desconocido',
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(fallbackPayload);
  }

  private fromMulterError(error: MulterError): {
    statusCode: number;
    code: string;
    message: string;
  } {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: 'UPLOAD_FILE_TOO_LARGE',
        message: `El archivo supera el limite permitido de ${this.toGbString(ADVERTISEMENT_MAX_FILE_SIZE_BYTES)}`,
      };
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: 'UPLOAD_UNEXPECTED_FIELD',
        message: 'Campo de archivo invalido. Debe usar el campo "file".',
      };
    }

    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: `UPLOAD_${error.code}`,
      message: 'Error al procesar la subida del archivo',
    };
  }

  private extractHttpMessage(
    exceptionResponse: string | object,
    fallbackMessage: string,
  ): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = (exceptionResponse as { message?: unknown }).message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }

    return fallbackMessage;
  }

  private extractHttpDetails(
    exceptionResponse: string | object,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      exceptionResponse &&
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const message = (exceptionResponse as { message?: unknown }).message;
      if (typeof message === 'string' || Array.isArray(message)) return message;
    }

    return 'Sin detalles adicionales';
  }

  private httpStatusToCode(statusCode: number): string {
    if (statusCode === 400) return 'UPLOAD_BAD_REQUEST';
    if (statusCode === 401) return 'UPLOAD_UNAUTHORIZED';
    if (statusCode === 413) return 'UPLOAD_FILE_TOO_LARGE';
    if (statusCode === 408) return 'UPLOAD_TIMEOUT';
    return 'UPLOAD_ERROR';
  }

  private toGbString(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    if (Number.isInteger(gb)) return `${gb}GB`;
    return `${gb.toFixed(2)}GB`;
  }
}
