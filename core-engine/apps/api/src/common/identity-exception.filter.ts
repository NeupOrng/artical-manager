import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { IdentityUnavailableError } from '@core/author';

/**
 * The identity service (Kratos) is unreachable or refused.
 *
 * **503, not 500.** It means "try again", not "your request was wrong": nothing
 * the caller can change fixes it, and an admin retrying is exactly the right
 * response. Author management writes our row FIRST, so a deactivation that
 * reaches this point has already taken effect in the API — the retry finishes
 * disabling the login. See libs/author/src/application/manage-authors.ts.
 *
 * Kept out of DomainExceptionFilter because this is not a domain error: no rule
 * was broken, an integration failed.
 */
@Catch(IdentityUnavailableError)
export class IdentityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(IdentityExceptionFilter.name);

  catch(error: IdentityUnavailableError, host: ArgumentsHost): void {
    // The message names the endpoint and the cause only — never traits, never a
    // recovery link.
    this.logger.error(error.message);

    host.switchToHttp().getResponse<Response>().status(HttpStatus.SERVICE_UNAVAILABLE).json({
      error: {
        code: 'IDENTITY_UNAVAILABLE',
        message:
          'The identity service did not respond. Nothing was lost — try again in a moment.',
      },
    });
  }
}
