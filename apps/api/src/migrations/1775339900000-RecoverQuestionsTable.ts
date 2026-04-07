import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecoverQuestionsTable1775339900000 implements MigrationInterface {
  name = 'RecoverQuestionsTable1775339900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'questions_difficulty_enum' AND n.nspname = 'public'
        ) THEN
          CREATE TYPE "public"."questions_difficulty_enum" AS ENUM ('EASY', 'MEDIUM', 'HARD');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "questions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "content" text NOT NULL,
        "options" jsonb NOT NULL,
        "correctAnswer" character varying NOT NULL,
        "difficulty" "public"."questions_difficulty_enum" NOT NULL DEFAULT 'MEDIUM',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY ("id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "questions"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "public"."questions_difficulty_enum"',
    );
  }
}
