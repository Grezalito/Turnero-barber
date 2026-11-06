-- DropForeignKey
ALTER TABLE "reminder_queue" DROP CONSTRAINT "reminder_queue_slot_id_fkey";

-- DropForeignKey
ALTER TABLE "reminder_queue" DROP CONSTRAINT "reminder_queue_barber_id_fkey";

-- DropTable
DROP TABLE "reminder_queue";

-- DropEnum
DROP TYPE "ReminderStatus";

