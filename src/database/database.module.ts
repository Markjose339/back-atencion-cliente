import { Module } from '@nestjs/common';
import { DB_CONN } from './db.conn';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { schema } from './schema';

@Module({
  providers: [
    {
      provide: DB_CONN,
      useFactory: (configService: ConfigService) => {
        const pool = new Pool({
          connectionString: configService.getOrThrow('DATABASE_URL'),
        });
        return drizzle(pool, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DB_CONN],
})
export class DatabaseModule {}
