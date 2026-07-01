#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENV_PATHS = ['.env.local', '.env'].map(file => path.join(PROJECT_ROOT, file));

const TARGET_ACCOUNTS = [
  {
    label: 'Staff',
    email: 'staff@queueless.com',
    password: 'Staff@123456',
    role: 'staff',
    full_name: 'QueueLess Staff',
    expectedRoute: 'StaffNavigator',
  },
  {
    label: 'Admin',
    email: 'admin@queueless.com',
    password: 'Admin@123456',
    role: 'admin',
    full_name: 'QueueLess Admin',
    expectedRoute: 'AdminNavigator',
  },
];

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const loadDotenvFile = filePath => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rawValue
      .join('=')
      .trim()
      .replace(/^['"]|['"]$/g, '');

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
};

const fail = (message, detail) => {
  console.error('\n[FAILED]', message);
  if (detail) {
    console.error(JSON.stringify(detail, null, 2));
  }
  process.exit(1);
};

const maskEmail = email => email.toLowerCase();

const routeForRole = role => {
  if (role === 'admin') {
    return 'AdminNavigator';
  }

  if (role === 'staff') {
    return 'StaffNavigator';
  }

  return 'PatientNavigator';
};

const getExactCount = async (client, table, applyFilter) => {
  let query = client.from(table).select('id', { count: 'exact', head: true });

  if (applyFilter) {
    query = applyFilter(query);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`${table} count failed: ${error.message}`);
  }

  return count ?? 0;
};

const listAllAuthUsers = async adminClient => {
  const users = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw new Error(`auth.users list failed: ${error.message}`);
    }

    const batch = data?.users ?? [];
    users.push(...batch);

    if (batch.length < perPage) {
      break;
    }

    page += 1;
  }

  return users;
};

const getProfilesByRole = async adminClient => {
  const { data, error } = await adminClient
    .from('profiles')
    .select('id, email, role, full_name')
    .in('role', ['staff', 'admin']);

  if (error) {
    throw new Error(`profiles role scan failed: ${error.message}`);
  }

  return data ?? [];
};

const getRowsForUserIds = async (adminClient, table, column, ids) => {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await adminClient
    .from(table)
    .select(`id, ${column}`)
    .in(column, ids);

  if (error) {
    throw new Error(`${table}.${column} reference scan failed: ${error.message}`);
  }

  return data ?? [];
};

const takeSnapshot = async adminClient => ({
  profiles: await getExactCount(adminClient, 'profiles'),
  clients: await getExactCount(adminClient, 'profiles', query => query.eq('role', 'client')),
  appointments: await getExactCount(adminClient, 'appointments'),
  notifications: await getExactCount(adminClient, 'notifications'),
});

const deleteAccount = async (adminClient, id) => {
  const { error: authError } = await adminClient.auth.admin.deleteUser(id, false);

  if (authError && !/not found/i.test(authError.message)) {
    throw new Error(`auth.users delete failed for ${id}: ${authError.message}`);
  }

  const { error: profileError } = await adminClient.from('profiles').delete().eq('id', id);

  if (profileError) {
    throw new Error(`profiles delete failed for ${id}: ${profileError.message}`);
  }
};

const createManagedAccount = async adminClient => {
  const created = [];

  for (const account of TARGET_ACCOUNTS) {
    const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: {
        full_name: account.full_name,
        role: account.role,
      },
    });

    if (userError || !userData?.user?.id) {
      throw new Error(`${account.label} auth user create failed: ${userError?.message ?? 'missing user id'}`);
    }

    const profile = {
      id: userData.user.id,
      full_name: account.full_name,
      email: account.email,
      role: account.role,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert(profile, { onConflict: 'id' });

    if (profileError) {
      throw new Error(`${account.label} profile upsert failed: ${profileError.message}`);
    }

    created.push({
      id: userData.user.id,
      email: account.email,
      role: account.role,
      expectedRoute: account.expectedRoute,
    });
  }

  return created;
};

const verifyLogin = async account => {
  const client = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const { data: loginData, error: loginError } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (loginError || !loginData?.user?.id) {
    throw new Error(`${account.label} login failed: ${loginError?.message ?? 'missing user id'}`);
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id, email, role, full_name')
    .eq('id', loginData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error(`${account.label} profile verification failed: ${profileError?.message ?? 'missing profile'}`);
  }

  const actualRoute = routeForRole(profile.role);

  await client.auth.signOut();

  return {
    email: account.email,
    id: loginData.user.id,
    loginWorks: true,
    profileRole: profile.role,
    expectedRole: account.role,
    roleMatches: profile.role === account.role,
    expectedRoute: account.expectedRoute,
    actualRoute,
    navigationMatches: actualRoute === account.expectedRoute,
  };
};

const main = async () => {
  ENV_PATHS.forEach(loadDotenvFile);

  const missing = REQUIRED_ENV.filter(key => !process.env[key]);

  if (missing.length > 0) {
    fail('Missing required environment variables.', {
      missing,
      howToRun:
        'SUPABASE_SERVICE_ROLE_KEY must be provided outside the mobile app, for example: SUPABASE_SERVICE_ROLE_KEY=... npm run accounts:production',
    });
  }

  const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  const targetEmails = new Set(TARGET_ACCOUNTS.map(account => account.email));
  const before = await takeSnapshot(adminClient);
  const authUsersBefore = await listAllAuthUsers(adminClient);
  const staffAdminProfilesBefore = await getProfilesByRole(adminClient);

  const candidateIds = new Set(staffAdminProfilesBefore.map(profile => profile.id));

  for (const user of authUsersBefore) {
    if (user.email && targetEmails.has(maskEmail(user.email))) {
      candidateIds.add(user.id);
    }
  }

  const candidateIdList = [...candidateIds];
  const appointmentRefs = await getRowsForUserIds(adminClient, 'appointments', 'user_id', candidateIdList);
  const notificationRefs = await getRowsForUserIds(adminClient, 'notifications', 'user_id', candidateIdList);

  if (appointmentRefs.length > 0 || notificationRefs.length > 0) {
    fail('Refusing to delete staff/admin auth users because existing appointments or notifications reference them.', {
      appointmentReferenceCount: appointmentRefs.length,
      notificationReferenceCount: notificationRefs.length,
      note:
        'This guard keeps existing appointments and notifications unchanged. Move or archive those references first if these are truly disposable test accounts.',
    });
  }

  for (const id of candidateIdList) {
    await deleteAccount(adminClient, id);
  }

  const createdAccounts = await createManagedAccount(adminClient);
  const loginVerification = [];

  for (const account of TARGET_ACCOUNTS) {
    loginVerification.push(await verifyLogin(account));
  }

  const after = await takeSnapshot(adminClient);
  const staffAdminProfilesAfter = await getProfilesByRole(adminClient);
  const authUsersAfter = await listAllAuthUsers(adminClient);
  const targetAuthUsersAfter = authUsersAfter
    .filter(user => user.email && targetEmails.has(maskEmail(user.email)))
    .map(user => ({ id: user.id, email: maskEmail(user.email ?? '') }));

  const report = {
    completedAt: new Date().toISOString(),
    deletedStaffAdminAccountCount: candidateIdList.length,
    createdAccounts,
    loginVerification,
    dataIntegrity: {
      clientsUnchanged: before.clients === after.clients,
      appointmentsUnchanged: before.appointments === after.appointments,
      notificationsUnchanged: before.notifications === after.notifications,
      before,
      after,
    },
    finalStaffAdminProfiles: staffAdminProfilesAfter
      .map(profile => ({
        id: profile.id,
        email: profile.email,
        role: profile.role,
        full_name: profile.full_name,
      }))
      .sort((a, b) => String(a.email).localeCompare(String(b.email))),
    targetAuthUsers: targetAuthUsersAfter.sort((a, b) => a.email.localeCompare(b.email)),
  };

  const allLoginsVerified = loginVerification.every(
    item => item.loginWorks && item.roleMatches && item.navigationMatches,
  );
  const onlyTargetStaffAdmins =
    staffAdminProfilesAfter.length === TARGET_ACCOUNTS.length &&
    staffAdminProfilesAfter.every(profile => {
      const account = TARGET_ACCOUNTS.find(item => item.email === profile.email);
      return account && account.role === profile.role;
    });
  const dataUnchanged =
    report.dataIntegrity.clientsUnchanged &&
    report.dataIntegrity.appointmentsUnchanged &&
    report.dataIntegrity.notificationsUnchanged;

  if (!allLoginsVerified || !onlyTargetStaffAdmins || !dataUnchanged) {
    fail('Production account verification failed.', report);
  }

  console.log('\n[OK] QueueLess production account management completed.');
  console.log(JSON.stringify(report, null, 2));
};

main().catch(error => {
  fail(error.message);
});
