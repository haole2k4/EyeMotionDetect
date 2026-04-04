import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameToUsers1774944374677 implements MigrationInterface {
  name = 'AddUsernameToUsers1774944374677';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" character varying`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "username" = "email" WHERE "username" IS NULL OR "username" = ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "username"`,
    );
  }
}
