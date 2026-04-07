import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExamTable1775342463583 implements MigrationInterface {
  name = 'AddExamTable1775342463583';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "exams" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text, "duration" integer NOT NULL DEFAULT '60', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b43159ee3efa440952794b4f53e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "exam_questions" ("exam_id" uuid NOT NULL, "question_id" uuid NOT NULL, CONSTRAINT "PK_cce6412ddeada2b2fdf5b7ddb78" PRIMARY KEY ("exam_id", "question_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7fa69d03d8ac4eb3f0e3ecf626" ON "exam_questions" ("exam_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c1bce580fc4692acc719e76db" ON "exam_questions" ("question_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "exam_users" ("exam_id" uuid NOT NULL, "user_id" uuid NOT NULL, CONSTRAINT "PK_b4571153893ba682a963b059639" PRIMARY KEY ("exam_id", "user_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ac2e76d585da01b0ceafc3b8b2" ON "exam_users" ("exam_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_744917a7c94011a1e2957dc315" ON "exam_users" ("user_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_questions" ADD CONSTRAINT "FK_7fa69d03d8ac4eb3f0e3ecf626e" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_questions" ADD CONSTRAINT "FK_7c1bce580fc4692acc719e76db8" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_users" ADD CONSTRAINT "FK_ac2e76d585da01b0ceafc3b8b29" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_users" ADD CONSTRAINT "FK_744917a7c94011a1e2957dc315f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exam_users" DROP CONSTRAINT "FK_744917a7c94011a1e2957dc315f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_users" DROP CONSTRAINT "FK_ac2e76d585da01b0ceafc3b8b29"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_questions" DROP CONSTRAINT "FK_7c1bce580fc4692acc719e76db8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "exam_questions" DROP CONSTRAINT "FK_7fa69d03d8ac4eb3f0e3ecf626e"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_744917a7c94011a1e2957dc315"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ac2e76d585da01b0ceafc3b8b2"`,
    );
    await queryRunner.query(`DROP TABLE "exam_users"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c1bce580fc4692acc719e76db"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7fa69d03d8ac4eb3f0e3ecf626"`,
    );
    await queryRunner.query(`DROP TABLE "exam_questions"`);
    await queryRunner.query(`DROP TABLE "exams"`);
  }
}
