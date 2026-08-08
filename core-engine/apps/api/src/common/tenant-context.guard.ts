import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { asTenantId, type TenantId } from '@core/shared';
import { TENANT_REPOSITORY, type TenantRepository } from '@core/tenant';

/**
 * Header Kong's key-auth plugin sets on the upstream request after validating
 * X-Tenant-Key. Each Kong consumer's custom_id is the tenant's UUID, so tenancy
 * resolves with no extra lookup table.
 *
 * Kong MUST strip any client-supplied X-Consumer-* header before setting these.
 * If a caller can send this and have it survive, they can read any tenant.
 */
const CONSUMER_ID_HEADER = 'x-consumer-custom-id';

export interface TenantContext {
  tenantId: TenantId;
  name: string;
  domain: string;
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const consumerId = req.headers[CONSUMER_ID_HEADER];

    if (typeof consumerId !== 'string' || consumerId.length === 0) {
      // Unreachable in production — Kong rejects an unknown key before this.
      // Reaching here means the gateway is misconfigured or bypassed.
      throw new UnauthorizedException('Missing tenant credential.');
    }

    const tenant = await this.tenants.findById(asTenantId(consumerId));
    if (!tenant) throw new UnauthorizedException('Unknown tenant.');

    (req as Request & { tenant?: TenantContext }).tenant = {
      tenantId: tenant.id,
      name: tenant.name,
      domain: tenant.domain,
    };

    return true;
  }
}

export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const req = context.switchToHttp().getRequest<Request & { tenant?: TenantContext }>();
    if (!req.tenant) throw new UnauthorizedException('Tenant context not resolved.');
    return req.tenant;
  },
);
