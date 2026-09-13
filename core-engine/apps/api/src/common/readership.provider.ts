import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DisabledReadershipAnalytics,
  READERSHIP_ANALYTICS,
  UmamiReadershipAnalytics,
} from '@core/article';

/**
 * Readership analytics (Umami), bound once for the whole app.
 *
 * Global and single-instance on purpose: the public views controller writes to
 * it and the dashboard reads from it, and one instance means one Umami login
 * and one report cache rather than one per module.
 *
 * Unconfigured (no UMAMI_URL) binds the disabled implementation: views are
 * still counted in article_views, and the dashboard reports analytics as
 * unavailable instead of the API refusing to boot. See
 * docs/proposals/dashboard-analytics-umami.md.
 */
@Global()
@Module({
  providers: [
    {
      provide: READERSHIP_ANALYTICS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('UMAMI_URL');
        const username = config.get<string>('UMAMI_USERNAME');
        const password = config.get<string>('UMAMI_PASSWORD');

        return url && username && password
          ? new UmamiReadershipAnalytics({ url: url.replace(/\/$/, ''), username, password })
          : new DisabledReadershipAnalytics();
      },
    },
  ],
  exports: [READERSHIP_ANALYTICS],
})
export class ReadershipModule {}
