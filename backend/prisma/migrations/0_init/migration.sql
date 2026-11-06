-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'BARBER', 'CLIENT');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrphanPaymentStatus" AS ENUM ('REQUIRES_REFUND', 'REFUNDED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'CLIENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "barber_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shop_name" TEXT NOT NULL,
    "address" TEXT,
    "reminder_addon_active" BOOLEAN NOT NULL DEFAULT false,
    "reminder_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "barber_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_settlements" (
    "id" TEXT NOT NULL,
    "barber_id" TEXT NOT NULL,
    "week_start" TIMESTAMP(3) NOT NULL,
    "week_end" TIMESTAMP(3) NOT NULL,
    "confirmed_slots" INTEGER NOT NULL DEFAULT 0,
    "bonus_tier" TEXT NOT NULL DEFAULT 'NONE',
    "bonus_amount_ars" INTEGER NOT NULL DEFAULT 0,
    "reminder_ia_bonified" BOOLEAN NOT NULL DEFAULT false,
    "transferred" BOOLEAN NOT NULL DEFAULT false,
    "transferred_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_slots" (
    "id" TEXT NOT NULL,
    "barber_id" TEXT NOT NULL,
    "client_id" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "locked_until" TIMESTAMP(3),
    "deposit_amount" INTEGER NOT NULL DEFAULT 2000,
    "mp_payment_id" TEXT,
    "mp_preference_id" TEXT,
    "lock_token_hash" TEXT,
    "confirmation_sent_at" TIMESTAMP(3),
    "reminder_24h_sent_at" TIMESTAMP(3),
    "reminder_2h_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_queue" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "barber_id" TEXT NOT NULL,
    "client_phone" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "generated_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminder_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orphan_payments" (
    "id" TEXT NOT NULL,
    "mp_payment_id" TEXT NOT NULL,
    "slot_id" TEXT,
    "client_id" TEXT,
    "amount" DOUBLE PRECISION,
    "reason" TEXT NOT NULL,
    "status" "OrphanPaymentStatus" NOT NULL DEFAULT 'REQUIRES_REFUND',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orphan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "slot_id" TEXT NOT NULL,
    "client_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_dni_key" ON "users"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "barber_profiles_user_id_key" ON "barber_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "barber_profiles_slug_key" ON "barber_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_settlements_barber_id_week_start_key" ON "weekly_settlements"("barber_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slots_mp_payment_id_key" ON "appointment_slots"("mp_payment_id");

-- CreateIndex
CREATE INDEX "appointment_slots_status_locked_until_idx" ON "appointment_slots"("status", "locked_until");

-- CreateIndex
CREATE INDEX "appointment_slots_status_start_time_idx" ON "appointment_slots"("status", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_slots_barber_id_start_time_key" ON "appointment_slots"("barber_id", "start_time");

-- CreateIndex
CREATE INDEX "reminder_queue_status_scheduled_for_idx" ON "reminder_queue"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "orphan_payments_mp_payment_id_key" ON "orphan_payments"("mp_payment_id");

-- CreateIndex
CREATE INDEX "orphan_payments_status_idx" ON "orphan_payments"("status");

-- CreateIndex
CREATE INDEX "push_subscriptions_client_id_idx" ON "push_subscriptions"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_slot_id_endpoint_key" ON "push_subscriptions"("slot_id", "endpoint");

-- AddForeignKey
ALTER TABLE "barber_profiles" ADD CONSTRAINT "barber_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_settlements" ADD CONSTRAINT "weekly_settlements_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_slots" ADD CONSTRAINT "appointment_slots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_queue" ADD CONSTRAINT "reminder_queue_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_queue" ADD CONSTRAINT "reminder_queue_barber_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barber_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "appointment_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

