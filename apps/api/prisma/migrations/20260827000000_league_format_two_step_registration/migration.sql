-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('standard', 'league');

-- AlterTable
ALTER TABLE "tournaments" ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'standard',
ADD COLUMN     "show_opponent_decklists" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tournament_registrations" ADD COLUMN     "participation_confirmed_at" TIMESTAMP(3);

-- Existing registrations predate the two-step flow: treat them as already
-- confirmed so ongoing tournaments do not auto-drop players at round 1.
UPDATE "tournament_registrations" SET "participation_confirmed_at" = "registered_at" WHERE "status" = 'active';

-- CreateTable
CREATE TABLE "league_matchdays" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "matchday_number" SMALLINT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "league_matchdays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "league_matchdays_tournament_id_matchday_number_key" ON "league_matchdays"("tournament_id", "matchday_number");

-- AddForeignKey
ALTER TABLE "league_matchdays" ADD CONSTRAINT "league_matchdays_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
