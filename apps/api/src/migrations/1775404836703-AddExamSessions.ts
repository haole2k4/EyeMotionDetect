import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExamSessions1775404836703 implements MigrationInterface {
    name = 'AddExamSessions1775404836703'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_answers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "selectedOption" character varying, "isCorrect" boolean NOT NULL DEFAULT false, "dwellTimeMs" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "session_id" uuid, "question_id" uuid, CONSTRAINT "PK_08977c1a2a5f1b8b472dbd87d04" PRIMARY KEY ("id")); COMMENT ON COLUMN "user_answers"."dwellTimeMs" IS 'Time spent looking at this answer/question in ms'`);
        await queryRunner.query(`CREATE TYPE "public"."exam_sessions_status_enum" AS ENUM('IN_PROGRESS', 'COMPLETED')`);
        await queryRunner.query(`CREATE TABLE "exam_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "status" "public"."exam_sessions_status_enum" NOT NULL DEFAULT 'IN_PROGRESS', "score" integer, "startTime" TIMESTAMP, "endTime" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "user_id" uuid, "exam_id" uuid, CONSTRAINT "PK_e7864af3b38e87bb9ca90d96322" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "user_answers" ADD CONSTRAINT "FK_b1dae489bd29735481f300ae311" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_answers" ADD CONSTRAINT "FK_adae59e684b873b084be36c5a7a" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exam_sessions" ADD CONSTRAINT "FK_22e93aaa289f8acd821f5cd070f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "exam_sessions" ADD CONSTRAINT "FK_1589df0f0205c61e74ca2cd3a24" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "exam_sessions" DROP CONSTRAINT "FK_1589df0f0205c61e74ca2cd3a24"`);
        await queryRunner.query(`ALTER TABLE "exam_sessions" DROP CONSTRAINT "FK_22e93aaa289f8acd821f5cd070f"`);
        await queryRunner.query(`ALTER TABLE "user_answers" DROP CONSTRAINT "FK_adae59e684b873b084be36c5a7a"`);
        await queryRunner.query(`ALTER TABLE "user_answers" DROP CONSTRAINT "FK_b1dae489bd29735481f300ae311"`);
        await queryRunner.query(`DROP TABLE "exam_sessions"`);
        await queryRunner.query(`DROP TYPE "public"."exam_sessions_status_enum"`);
        await queryRunner.query(`DROP TABLE "user_answers"`);
    }

}
