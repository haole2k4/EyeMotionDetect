import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccessibilityAndHeatmap1775500000000
  implements MigrationInterface
{
  name = 'AddAccessibilityAndHeatmap1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "accessibilityProfile" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "gazeHeatmap" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_sessions" ADD COLUMN IF NOT EXISTS "faceLossPauseCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exam_sessions" DROP COLUMN IF EXISTS "faceLossPauseCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_sessions" DROP COLUMN IF EXISTS "gazeHeatmap"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "accessibilityProfile"`,
    );
  }
}
