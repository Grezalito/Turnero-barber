import { PrismaClient, Role, SlotStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const superAdminDni = process.env.SUPERADMIN_DNI || '00000000';
  const superAdminRawPassword =
    process.env.SUPERADMIN_PASSWORD || 'adminPassword123!';
  const hashedAdminPassword = await bcrypt.hash(superAdminRawPassword, 10);

  const superAdmin = await prisma.user.upsert({
    where: { dni: superAdminDni },
    update: {
      role: Role.SUPERADMIN,
    },
    create: {
      dni: superAdminDni,
      password: hashedAdminPassword,
      name: 'SuperAdmin Plataforma',
      phone: '+5491100000000',
      email: 'admin@turnero-barber.com',
      role: Role.SUPERADMIN,
    },
  });

  console.log(`✅ Usuario SUPERADMIN creado/actualizado:`, {
    id: superAdmin.id,
    dni: superAdmin.dni,
    role: superAdmin.role,
  });

  // Crear barbero inicial para pruebas en vivo (OBSIDIAN & RAW BRASS STUDIO)
  const barberDni = '34888999';
  const hashedBarberPassword = await bcrypt.hash('barber1234', 10);

  const barberUser = await prisma.user.upsert({
    where: { dni: barberDni },
    update: {
      role: Role.BARBER,
    },
    create: {
      dni: barberDni,
      password: hashedBarberPassword,
      name: 'Facundo Quiroga',
      phone: '+5491155667788',
      email: 'facundo@obsidian-studio.com',
      role: Role.BARBER,
    },
  });

  const barberProfile = await prisma.barberProfile.upsert({
    where: { slug: 'obsidian-studio' },
    update: {
      user_id: barberUser.id,
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      address: 'Thames 1840, Palermo Soho',
      reminder_addon_active: true,
    },
    create: {
      user_id: barberUser.id,
      slug: 'obsidian-studio',
      shop_name: 'OBSIDIAN & RAW BRASS STUDIO',
      address: 'Thames 1840, Palermo Soho',
      reminder_addon_active: true,
    },
  });

  console.log(`✅ Barbería inicial creada/actualizada:`, {
    id: barberProfile.id,
    slug: barberProfile.slug,
    dni: barberUser.dni,
  });

  // Generar turnos reales de 30 minutos para mañana y pasado mañana
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const hoursTomorrow = [
    '10:00',
    '10:30',
    '11:00',
    '11:30',
    '12:00',
    '12:30',
    '16:00',
    '16:30',
    '17:00',
    '17:30',
    '18:00',
    '18:30',
  ];
  const hoursDayAfter = [
    '09:00',
    '09:30',
    '10:00',
    '10:30',
    '15:00',
    '15:30',
    '16:00',
    '16:30',
  ];

  const slotsData: Array<{
    barber_id: string;
    start_time: Date;
    end_time: Date;
    status: SlotStatus;
    deposit_amount: number;
  }> = [];

  for (const hhmm of hoursTomorrow) {
    const start = new Date(`${tomorrow}T${hhmm}:00.000Z`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    slotsData.push({
      barber_id: barberProfile.id,
      start_time: start,
      end_time: end,
      status: SlotStatus.AVAILABLE,
      deposit_amount: 2000,
    });
  }

  for (const hhmm of hoursDayAfter) {
    const start = new Date(`${dayAfter}T${hhmm}:00.000Z`);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    slotsData.push({
      barber_id: barberProfile.id,
      start_time: start,
      end_time: end,
      status: SlotStatus.AVAILABLE,
      deposit_amount: 2000,
    });
  }

  const createdSlots = await prisma.appointmentSlot.createMany({
    data: slotsData,
    skipDuplicates: true,
  });

  console.log(`✅ Turnos de 30 min generados en DB: ${createdSlots.count}`);

  // Generar 22 turnos CONFIRMED en el lunes de la semana actual para probar Meta Semanal (22/35) y Liquidaciones
  const now = new Date();
  const utcDay = now.getUTCDay();
  const diffToMonday = utcDay === 0 ? -6 : 1 - utcDay;
  const mondayDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) +
      diffToMonday * 24 * 60 * 60 * 1000,
  );
  const mondayStr = mondayDate.toISOString().slice(0, 10);

  for (let i = 0; i < 22; i++) {
    const startMs =
      new Date(`${mondayStr}T08:00:00.000Z`).getTime() + i * 30 * 60 * 1000;
    const start = new Date(startMs);
    const end = new Date(startMs + 30 * 60 * 1000);
    const mpId = `mp_seed_week_${mondayStr}_${i + 1}`;

    await prisma.appointmentSlot.upsert({
      where: {
        barber_id_start_time: {
          barber_id: barberProfile.id,
          start_time: start,
        },
      },
      update: {
        status: SlotStatus.CONFIRMED,
        mp_payment_id: mpId,
        deposit_amount: 2000,
      },
      create: {
        barber_id: barberProfile.id,
        start_time: start,
        end_time: end,
        status: SlotStatus.CONFIRMED,
        mp_payment_id: mpId,
        deposit_amount: 2000,
      },
    });
  }

  console.log(
    `✅ 22 turnos CONFIRMED semanales (Lunes ${mondayStr}) listos para Meta Semanal y Liquidaciones.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Error ejecutando el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
