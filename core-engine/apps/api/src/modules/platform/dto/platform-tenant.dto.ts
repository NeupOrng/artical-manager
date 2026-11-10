import { ApiProperty } from '@nestjs/swagger';

/**
 * A site, as the operator picking one sees it.
 *
 * Deliberately not the dashboard's `TenantSummaryDto`: that one carries
 * readership figures for an at-a-glance overview, and this is a picker. Sharing
 * the shape would mean every future dashboard metric silently becoming part of
 * this response too.
 */
export class PlatformTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() domain!: string;
  @ApiProperty() nicheLabel!: string;
  @ApiProperty({ description: 'People with access, including deactivated.' })
  authorCount!: number;
}

export class PlatformTenantListDto {
  @ApiProperty({ type: [PlatformTenantDto] }) data!: PlatformTenantDto[];
}
