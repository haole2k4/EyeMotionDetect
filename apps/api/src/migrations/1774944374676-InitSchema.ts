import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1774944374676 implements MigrationInterface {
  name = 'InitSchema1774944374676';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "gaze_weights" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "polyCoeffsX" jsonb, "polyCoeffsY" jsonb, "mlpWeightsJson" text, "mlpWeightsBin" bytea, "earThreshold" double precision NOT NULL DEFAULT '0.21', "calibrationPoints" integer NOT NULL DEFAULT '0', "lastMaePixels" double precision, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" uuid, CONSTRAINT "REL_ec27f80db029f690a947a68a3e" UNIQUE ("userId"), CONSTRAINT "PK_1d0b6784b418455b0ff5d819ae2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "gaze_weights" ADD CONSTRAINT "FK_ec27f80db029f690a947a68a3e5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "gaze_weights" DROP CONSTRAINT "FK_ec27f80db029f690a947a68a3e5"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "gaze_weights"`);
  }
}
