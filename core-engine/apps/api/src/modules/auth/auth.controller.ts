import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { permissionsFor } from '@core/author';
import { TENANT_REPOSITORY, type TenantRepository } from '@core/tenant';
import { PrincipalGuard } from '../../common/guards/principal.guard';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import type { Principal } from '../../common/principal';
import { MeDto } from './dto/me.dto';

/**
 * The endpoint the backoffice calls immediately after a Kratos login to find out
 * who it is talking to.
 *
 * This is deliberately the ONLY thing in this module. There is no login handler,
 * no logout handler, no password reset — Kratos owns all of that, and the
 * backoffice talks to it directly through its own proxy. NestJS never sees a
 * credential. core-engine/CLAUDE.md, "What NOT to do": no auth in NestJS.
 *
 * What this DOES do is close the loop that Kratos cannot: a valid session proves
 * an identity exists, not that it is provisioned as an author of some tenant.
 * PrincipalGuard is what turns the former into the latter, and a 403 here is how
 * the backoffice learns the difference.
 */
@ApiTags('auth')
@Controller('admin/v1')
@UseGuards(PrincipalGuard)
export class AuthController {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'The current principal',
    description:
      'Resolves the edge-validated identity to a tenant author or a platform '
      + 'admin. The backoffice calls this after login to decide what to render.',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({
    description:
      'No identity header. In a correct deployment this is unreachable — it '
      + 'means the gateway is misconfigured or being bypassed.',
  })
  @ApiForbiddenResponse({
    description:
      'The identity is valid but is not provisioned as an author or platform '
      + 'admin, or the account is deactivated.',
  })
  async me(@CurrentPrincipal() principal: Principal): Promise<MeDto> {
    // Narrowed on `kind` rather than reading optional fields — the union makes
    // the tenant-less case impossible to forget. See common/principal.ts.
    if (principal.kind === 'platform-admin') {
      return {
        kind: 'platform-admin',
        id: principal.platformAdminId,
        username: principal.username,
        name: principal.name,
        tenantId: null,
        tenantName: null,
        role: null,
        // A platform admin holds no TENANT permissions — they have no tenant.
        // Their own surface is guarded by @PlatformAdminOnly().
        permissions: [],
      };
    }

    const tenant = await this.tenants.findById(principal.tenantId);

    return {
      kind: 'author',
      id: principal.authorId,
      username: principal.username,
      name: principal.name,
      tenantId: principal.tenantId,
      // Null only if the tenant row vanished under a live author, which is a
      // broken FK rather than a normal state. The chrome renders without a site
      // name instead of 500ing on every page.
      tenantName: tenant?.name ?? null,
      role: principal.role,
      // What this author may do. The backoffice hides controls by permission
      // rather than by comparing role names, so moving authorization to Keto
      // later does not touch the UI.
      permissions: permissionsFor(principal.role),
    };
  }
}
