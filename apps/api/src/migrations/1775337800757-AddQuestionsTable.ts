import { MigrationInterface, QueryRunner } from "typeorm";

export class AddQuestionsTable1775337800757 implements MigrationInterface {
    name = 'AddQuestionsTable1775337800757'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."questions_difficulty_enum" AS ENUM('EASY', 'MEDIUM', 'HARD')`);
        await queryRunner.query(`CREATE TABLE "questions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content" text NOT NULL, "options" jsonb NOT NULL, "correctAnswer" character varying NOT NULL, "difficulty" "public"."questions_difficulty_enum" NOT NULL DEFAULT 'MEDIUM', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_08a6d4b0f49ff300bf3a0ca60ac" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "questions"`);
        await queryRunner.query(`DROP TYPE "public"."questions_difficulty_enum"`);
    }

}
