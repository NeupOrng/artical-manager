import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IDENTITY_PROVIDER, KratosIdentityProvider } from '@core/author';

/**
 * The Kratos ADMIN client, bound once for the whole app.
 *
 * REQUIRED config, unlike analytics: without it nobody can be invited or
 * deactivated, and failing at boot is far better than failing at the moment an
 * admin tries to remove someone who left.
 *
 * `KRATOS_ADMIN_URL` must point at the internal address (`kratos:4434`). It is
 * never routed through Kong — anything that can reach it can create identities.
 */
@Global()
@Module({
  providers: [
    {
      provide: IDENTITY_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new KratosIdentityProvider(
          config.getOrThrow<string>('KRATOS_ADMIN_URL').replace(/\/$/, ''),
        ),
    },
  ],
  exports: [IDENTITY_PROVIDER],
})
export class IdentityModule {}
