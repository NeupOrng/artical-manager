import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '@core/shared';

/**
 * Single place domain errors become HTTP. Controllers never throw
 * HttpException — adding a domain error without extending this map means the
 * client gets a 500 for something that should be a 422.
 */
const STATUS_BY_KIND: Record<DomainError['kind'], HttpStatus> = {
  invariant: HttpStatus.UNPROCESSABLE_ENTITY,
  conflict: HttpStatus.CONFLICT,
  'not-found': HttpStatus.NOT_FOUND,
  forbidden: HttpStatus.FORBIDDEN,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_KIND[error.kind];

    this.logger.debug(`${error.code}: ${error.message}`);

    res.status(status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
  }
}
