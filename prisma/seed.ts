process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const isLocal =
  process.env.DATABASE_URL?.includes('localhost') ||
  process.env.DATABASE_URL?.includes('127.0.0.1') ||
  process.env.DATABASE_URL?.includes('postgres') ||
  process.env.DATABASE_URL?.includes('db');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Seed Subscription Plans
  const plans = [
    {
      name: 'Free Trial',
      slug: 'free-trial',
      maxBranches: 1,
      maxStaff: 2,
      maxAppointments: 100,
      priceMonthly: 0,
      priceYearly: 0,
      features: {
        bookingWebsite: true,
        whatsappReminders: false,
        analytics: false,
        customDomain: false,
        marketing: false,
      },
    },
    {
      name: 'Starter',
      slug: 'starter',
      maxBranches: 1,
      maxStaff: 5,
      maxAppointments: 1000,
      priceMonthly: 999,
      priceYearly: 9999,
      features: {
        bookingWebsite: true,
        whatsappReminders: true,
        analytics: false,
        customDomain: false,
        marketing: false,
      },
    },
    {
      name: 'Growth',
      slug: 'growth',
      maxBranches: 5,
      maxStaff: 20,
      maxAppointments: 5000,
      priceMonthly: 2499,
      priceYearly: 24999,
      features: {
        bookingWebsite: true,
        whatsappReminders: true,
        analytics: true,
        customDomain: true,
        marketing: true,
      },
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      maxBranches: 50,
      maxStaff: 200,
      maxAppointments: 50000,
      priceMonthly: 9999,
      priceYearly: 99999,
      features: {
        bookingWebsite: true,
        whatsappReminders: true,
        analytics: true,
        customDomain: true,
        marketing: true,
        prioritySupport: true,
        apiAccess: true,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
  }
  console.log(`  ✅ ${plans.length} subscription plans seeded`);

  // 2. Seed Permissions
  const permissions = [
    // Appointments
    { name: 'appointment:create', description: 'Create booking appointments' },
    { name: 'appointment:read', description: 'View booking appointments' },
    { name: 'appointment:update', description: 'Modify booking appointments' },
    { name: 'appointment:delete', description: 'Soft delete appointments' },

    // Payments
    { name: 'payment:create', description: 'Collect and record payments' },
    { name: 'payment:read', description: 'View payment records' },
    { name: 'payment:refund', description: 'Process payment refunds' },

    // Staff
    { name: 'staff:create', description: 'Add new staff members' },
    { name: 'staff:read', description: 'View staff profiles' },
    { name: 'staff:update', description: 'Edit staff profiles' },
    { name: 'staff:delete', description: 'Remove staff members' },

    // Customers
    { name: 'customer:create', description: 'Add new customers' },
    { name: 'customer:read', description: 'View customer profiles' },
    { name: 'customer:update', description: 'Edit customer profiles' },
    { name: 'customer:delete', description: 'Remove customers' },

    // Services
    { name: 'service:create', description: 'Add new services' },
    { name: 'service:read', description: 'View service catalog' },
    { name: 'service:update', description: 'Edit services' },
    { name: 'service:delete', description: 'Remove services' },

    // Business
    { name: 'business:read', description: 'View business settings' },
    { name: 'business:update', description: 'Modify business configurations' },

    // Branch
    { name: 'branch:create', description: 'Add new branches' },
    { name: 'branch:read', description: 'View branch info' },
    { name: 'branch:update', description: 'Modify branch settings' },
    { name: 'branch:delete', description: 'Remove branches' },

    // Analytics
    { name: 'analytics:read', description: 'View analytics and reports' },
    { name: 'analytics:export', description: 'Export analytics data' },

    // Website
    { name: 'website:manage', description: 'Manage website builder' },
    { name: 'website:publish', description: 'Publish website changes' },

    // Marketing
    { name: 'campaign:create', description: 'Create marketing campaigns' },
    { name: 'campaign:read', description: 'View campaign analytics' },
    { name: 'campaign:send', description: 'Send marketing campaigns' },

    // Subscription
    { name: 'subscription:manage', description: 'Manage billing and subscription' },

    // Rozx Platform Admin
    { name: 'admin:all', description: 'Full platform administration' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: {},
      create: perm,
    });
  }
  console.log(`  ✅ ${permissions.length} permissions seeded`);

  // 3. Seed System Roles with deterministic UUIDs
  const systemRoles = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'OWNER',
      description: 'Full tenant ownership control — all permissions',
      isSystem: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'MANAGER',
      description: 'Branch management — staff, appointments, customers, reports',
      isSystem: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'RECEPTION',
      description: 'Front desk operations — bookings, check-in, payments',
      isSystem: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000004',
      name: 'STAFF',
      description: 'Individual staff — view own schedule only',
      isSystem: true,
    },
    {
      id: '00000000-0000-0000-0000-000000000005',
      name: 'ADMIN',
      description: 'Rozx platform administrator — full platform-wide control',
      isSystem: true,
    },
  ];

  // Permission assignments per role
  const rolePermissions: Record<string, string[]> = {
    OWNER: permissions.map((p) => p.name), // All permissions
    MANAGER: [
      'appointment:create', 'appointment:read', 'appointment:update', 'appointment:delete',
      'payment:create', 'payment:read',
      'staff:create', 'staff:read', 'staff:update',
      'customer:create', 'customer:read', 'customer:update',
      'service:read',
      'business:read',
      'branch:read', 'branch:update',
      'analytics:read',
    ],
    RECEPTION: [
      'appointment:create', 'appointment:read', 'appointment:update',
      'payment:create', 'payment:read',
      'customer:create', 'customer:read', 'customer:update',
      'service:read',
      'staff:read',
    ],
    STAFF: [
      'appointment:read',
      'customer:read',
      'service:read',
    ],
    ADMIN: [
      'admin:all',
    ],
  };

  for (const role of systemRoles) {
    const createdRole = await prisma.role.upsert({
      where: { id: role.id },
      update: { name: role.name, description: role.description, isSystem: role.isSystem },
      create: role,
    });

    // Assign permissions
    const permNames = rolePermissions[role.name] || [];
    const allPerms = await prisma.permission.findMany({
      where: { name: { in: permNames } },
    });

    for (const p of allPerms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: createdRole.id, permissionId: p.id },
        },
        update: {},
        create: { roleId: createdRole.id, permissionId: p.id },
      });
    }

    console.log(`  ✅ Role "${role.name}" seeded with ${allPerms.length} permissions`);
  }

  // 4. Seed Default System Themes
  const systemThemes = [
    {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'Modern',
      isSystem: true,
      colorsJson: {
        primary: '#0F172A',
        secondary: '#3B82F6',
        background: '#F8FAFC',
        text: '#1E293B',
        accent: '#F59E0B',
      },
      typographyJson: {
        fontFamily: 'Inter, sans-serif',
        headingSize: '2.25rem',
        bodySize: '1rem',
      },
      spacingJson: {
        containerPadding: '2rem',
        sectionMargin: '4rem',
      },
      buttonStylesJson: {
        borderRadius: '0.375rem',
        padding: '0.5rem 1rem',
      },
      layoutRulesJson: {
        headerStyle: 'sticky',
        footerStyle: 'simple',
      },
    },
    {
      id: '00000000-0000-0000-0000-000000000012',
      name: 'Luxury',
      isSystem: true,
      colorsJson: {
        primary: '#1A1A1A',
        secondary: '#D4AF37',
        background: '#FAF9F6',
        text: '#222222',
        accent: '#800020',
      },
      typographyJson: {
        fontFamily: 'Playfair Display, serif',
        headingSize: '2.5rem',
        bodySize: '1.05rem',
      },
      spacingJson: {
        containerPadding: '2.5rem',
        sectionMargin: '5rem',
      },
      buttonStylesJson: {
        borderRadius: '0px',
        padding: '0.75rem 1.5rem',
      },
      layoutRulesJson: {
        headerStyle: 'centered',
        footerStyle: 'detailed',
      },
    },
    {
      id: '00000000-0000-0000-0000-000000000013',
      name: 'Minimal',
      isSystem: true,
      colorsJson: {
        primary: '#18181B',
        secondary: '#71717A',
        background: '#FFFFFF',
        text: '#09090B',
        accent: '#27272A',
      },
      typographyJson: {
        fontFamily: 'Roboto Mono, monospace',
        headingSize: '2rem',
        bodySize: '0.95rem',
      },
      spacingJson: {
        containerPadding: '1.5rem',
        sectionMargin: '3.5rem',
      },
      buttonStylesJson: {
        borderRadius: '0.25rem',
        padding: '0.5rem 1rem',
      },
      layoutRulesJson: {
        headerStyle: 'minimalist',
        footerStyle: 'minimalist',
      },
    },
    {
      id: '00000000-0000-0000-0000-000000000014',
      name: 'Beauty',
      isSystem: true,
      colorsJson: {
        primary: '#D946EF',
        secondary: '#EC4899',
        background: '#FFF1F2',
        text: '#4C0519',
        accent: '#F43F5E',
      },
      typographyJson: {
        fontFamily: 'Outfit, sans-serif',
        headingSize: '2.3rem',
        bodySize: '1rem',
      },
      spacingJson: {
        containerPadding: '2rem',
        sectionMargin: '4rem',
      },
      buttonStylesJson: {
        borderRadius: '9999px',
        padding: '0.6rem 1.2rem',
      },
      layoutRulesJson: {
        headerStyle: 'glassmorphism',
        footerStyle: 'simple',
      },
    },
    {
      id: '00000000-0000-0000-0000-000000000015',
      name: 'Wellness',
      isSystem: true,
      colorsJson: {
        primary: '#064E3B',
        secondary: '#10B981',
        background: '#F0FDF4',
        text: '#062F4F',
        accent: '#F59E0B',
      },
      typographyJson: {
        fontFamily: 'DM Sans, sans-serif',
        headingSize: '2.25rem',
        bodySize: '1rem',
      },
      spacingJson: {
        containerPadding: '2rem',
        sectionMargin: '4.5rem',
      },
      buttonStylesJson: {
        borderRadius: '0.5rem',
        padding: '0.5rem 1rem',
      },
      layoutRulesJson: {
        headerStyle: 'standard',
        footerStyle: 'simple',
      },
    },
  ];

  for (const theme of systemThemes) {
    await prisma.theme.upsert({
      where: { id: theme.id },
      update: {
        name: theme.name,
        colorsJson: theme.colorsJson,
        typographyJson: theme.typographyJson,
        spacingJson: theme.spacingJson,
        buttonStylesJson: theme.buttonStylesJson,
        layoutRulesJson: theme.layoutRulesJson,
      },
      create: theme,
    });
  }
  console.log(`  ✅ ${systemThemes.length} system themes seeded`);

  console.log('\n🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
