// Phase 1A end-to-end checks through the real API (PostgREST + Auth), the way the
// app and a public QR page call it. Local stack only:
//
//   supabase db reset && node supabase/tests/api/phase-1a.mjs
//
// Since 1B, public QR joins come from the web server (service role, after the
// captcha) through issue_public_token; anon can no longer call issue_token.
// Set SUPABASE_SERVICE_ROLE_KEY to the local stack's key (supabase status).
//
// Writes to the local database (not rolled back); run `supabase db reset` after.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (supabase status -o env)');
  process.exit(2);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL)) {
  console.error(`Refusing to run against ${URL}: local stack only.`);
  process.exit(2);
}

const CENTER_A = '521f1349-05c4-4417-9fa5-5289963af7db';
const CENTER_B = 'd2c1a3df-bb89-4fde-b73d-5bb9ec763481';
const DOCTOR_A = 'd0000000-0000-4000-8000-00000000000a';
const DOCTOR_B = 'd0000000-0000-4000-8000-00000000000b';
const SERVICE_A = '50000000-0000-4000-8000-00000000000a';
const APPT_B = 'e0000000-0000-4000-8000-000000000003';

let passed = 0;
let failed = 0;
const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`ok   ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`);
  }
};

const client = () => createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = async email => {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password: 'password123' });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
};

const anon = client();
// The join page's server: service role key, local stack only (guarded above).
const joinServer = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const publicJoin = args => joinServer.rpc('issue_public_token', { p_source: 'qr', ...args });
const staffA = await signIn('staff.a@mediq.test');
const staffB = await signIn('staff.b@mediq.test');
const ownerA = await signIn('owner.a@mediq.test');
const doctorA = await signIn('doctor.a@mediq.test');
const patient1 = await signIn('patient.1@mediq.test');
const patient2 = await signIn('patient.2@mediq.test');

// Clinic "today" (seed organizations use Asia/Karachi).
const today = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 29 * 3600 * 1000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 1. Clinic A users cannot see or change clinic B data
// ---------------------------------------------------------------------------
{
  const { data } = await staffA.from('appointments').select('id, center_id');
  check('staff A: lists only center A appointments', data.length > 0 && data.every(r => r.center_id === CENTER_A), data);

  const { data: upd } = await staffA.from('appointments').update({ status: 'cancelled' }).eq('id', APPT_B).select('id');
  check('staff A: cannot cancel a clinic B appointment (0 rows)', Array.isArray(upd) && upd.length === 0, upd);

  const { error: callErr } = await ownerA.rpc('call_appointment', { p_appointment_id: APPT_B });
  check('owner A: call_appointment on clinic B refused', callErr?.code === '42501', callErr);

  const { data: orgs } = await ownerA.from('organizations').select('id');
  check('owner A: sees one organization', orgs?.length === 1, orgs);

  const { data: bPatients } = await staffB.from('patients').select('id, organization_id');
  const { data: aOrg } = await ownerA.from('organizations').select('id').single();
  check('staff B: no clinic A patient records', bPatients.every(p => p.organization_id !== aOrg.id), bPatients);

  const { error: moveErr } = await patient1
    .from('appointments')
    .update({ center_id: CENTER_B })
    .eq('id', 'e0000000-0000-4000-8000-000000000001');
  check('patient: cannot move own appointment to clinic B', moveErr?.code === '42501', moveErr);

  const { error: walkErr } = await staffA.rpc('issue_token', {
    p_doctor_id: DOCTOR_B, p_name: 'X', p_phone: null, p_source: 'walk_in',
  });
  check('staff A: cannot issue walk-ins for clinic B', walkErr?.code === '42501', walkErr);
}

// ---------------------------------------------------------------------------
// 2. Public QR join (via the join page's server) gets a token, and status works without PII
// ---------------------------------------------------------------------------
let qrCode;
{
  const directJoin = await fetch(`${URL}/rest/v1/rpc/issue_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_doctor_id: DOCTOR_A, p_name: 'Bot', p_phone: '+923450000000', p_source: 'qr' }),
  });
  check('anon: issue_token directly is refused (HTTP 401), joins need the captcha-checked server', directJoin.status === 401, directJoin.status);
  const { error: patientJoinErr } = await patient1.rpc('issue_public_token', {
    p_doctor_id: DOCTOR_A, p_name: 'X', p_phone: '+923450000001',
  });
  check('signed-in patient: issue_public_token refused', patientJoinErr?.code === '42501', patientJoinErr);

  const { data, error } = await publicJoin({ p_doctor_id: DOCTOR_A, p_name: 'Api Guest', p_phone: '+92 345 1112223' });
  const row = data?.[0];
  qrCode = row?.public_code;
  check('public: QR join returns a token', !error && /^[A-HJ-NP-Z2-9]{8}$/.test(qrCode ?? '') && row.token_number > 0, error ?? data);
  check('public: no appointment id in the response', row && row.appointment_id === null, row);

  const res = await fetch(`${URL}/rest/v1/rpc/get_token_status`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_public_code: qrCode }),
  });
  const body = await res.json();
  const keys = Object.keys(body[0] ?? {}).sort().join(',');
  check('anon: get_token_status over HTTP is 200 with one row', res.status === 200 && body.length === 1, body);
  check('status has exactly the six public fields',
        keys === 'current_token,doctor_name,eta_minutes,people_ahead,status,token_number', keys);
  const raw = JSON.stringify(body);
  check('status contains no patient name or phone', !/Api Guest|1112223|3451112223/i.test(raw), raw);
  check('status: waiting, doctor display name, token number', body[0]?.status === 'waiting'
        && body[0]?.doctor_name === 'Dr. A' && body[0]?.token_number === row.token_number, body);

  const { data: none } = await anon.rpc('get_token_status', { p_public_code: 'ZZZZZZZZ' });
  check('unknown code: empty result', Array.isArray(none) && none.length === 0, none);

  const { data: direct, error: directErr } = await anon.from('appointments').select('id');
  check('anon: appointments table still closed', (direct ?? []).length === 0 || directErr, direct);

  // Per-phone limit: 3 public joins per clinic per day -> HTTP 429.
  for (const n of [2, 3]) {
    await publicJoin({ p_doctor_id: DOCTOR_A, p_name: `Api Guest ${n}`, p_phone: '+923451112223' });
  }
  const limited = await fetch(`${URL}/rest/v1/rpc/issue_public_token`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_doctor_id: DOCTOR_A, p_name: 'Api Guest 4', p_phone: '+923451112223', p_source: 'qr' }),
  });
  check('public: 4th join from the same phone -> HTTP 429', limited.status === 429, limited.status);
}

// ---------------------------------------------------------------------------
// 3. Existing app flows: booking, check-in, call, complete, cancel
// ---------------------------------------------------------------------------
{
  // Booking (SelectSlot -> ConfirmBooking).
  const { data: lockId, error: lockErr } = await patient2.rpc('lock_slot', {
    p_doctor_id: DOCTOR_A, p_center_id: CENTER_A, p_date: tomorrow, p_time: '10:30 AM',
  });
  const { data: apptId, error: bookErr } = await patient2.rpc('book_appointment', {
    p_lock_id: lockId, p_service_id: SERVICE_A, p_notes: 'api test',
  });
  check('patient: lock_slot + book_appointment', !lockErr && !bookErr && typeof apptId === 'string', lockErr ?? bookErr);

  const { data: mine } = await patient2.from('appointments_full').select('id, status, patient_name, public_code').eq('id', apptId).single();
  check('patient: sees the booking (pending, own name, code)', mine?.status === 'pending' && mine?.patient_name === 'Patient Two'
        && /^[A-HJ-NP-Z2-9]{8}$/.test(mine?.public_code ?? ''), mine);

  // Staff confirms (queueService direct update + audit log).
  const { data: conf, error: confErr } = await staffA.from('appointments')
    .update({ status: 'confirmed' }).eq('id', apptId).eq('status', 'pending').select('id, status').maybeSingle();
  const { error: auditErr } = await staffA.from('audit_logs').insert({
    staff_user_id: (await staffA.auth.getUser()).data.user.id, appointment_id: apptId, action: 'confirm',
    old_status: 'pending', new_status: 'confirmed',
  });
  check('staff: confirms with direct update + audit log', !confErr && conf?.status === 'confirmed' && !auditErr, confErr ?? auditErr);

  // Patient QR check-in (appointmentService direct update).
  const { data: chk, error: chkErr } = await patient2.from('appointments')
    .update({ status: 'checked_in', checked_in_at: new Date().toISOString() })
    .eq('id', apptId).eq('status', 'confirmed').select('id, status').maybeSingle();
  check('patient: checks in', !chkErr && chk?.status === 'checked_in', chkErr ?? chk);

  // Call (staff RPC) and complete (doctor RPC).
  const { error: callErr } = await staffA.rpc('call_appointment', { p_appointment_id: apptId });
  check('staff: call_appointment', !callErr, callErr);
  const { error: doneErr } = await doctorA.rpc('complete_appointment', { p_appointment_id: apptId });
  const { data: done } = await patient2.from('appointments').select('status').eq('id', apptId).single();
  check('doctor: complete_appointment', !doneErr && done?.status === 'completed', doneErr ?? done);

  // Cancel (patient RPC) on a second booking.
  const { data: lock2 } = await patient1.rpc('lock_slot', {
    p_doctor_id: DOCTOR_A, p_center_id: CENTER_A, p_date: tomorrow, p_time: '11:00 AM',
  });
  const { data: appt2 } = await patient1.rpc('book_appointment', { p_lock_id: lock2, p_service_id: SERVICE_A, p_notes: null });
  const { error: cancelErr } = await patient1.rpc('cancel_appointment', { p_appointment_id: appt2, p_reason: 'api test' });
  const { data: cancelled } = await patient1.from('appointments').select('status').eq('id', appt2).single();
  check('patient: cancel_appointment', !cancelErr && cancelled?.status === 'cancelled', cancelErr ?? cancelled);

  const { error: otherCancel } = await patient2.rpc('cancel_appointment', { p_appointment_id: appt2, p_reason: 'x' });
  check('another patient cannot cancel it', !!otherCancel, otherCancel);
}

// ---------------------------------------------------------------------------
// 4. Walk-ins on the existing staff/doctor screens
// ---------------------------------------------------------------------------
{
  const { data, error } = await staffA.rpc('issue_token', {
    p_doctor_id: DOCTOR_A, p_name: 'Api Walkin', p_phone: null, p_source: 'walk_in',
  });
  check('receptionist: walk-in token with appointment id', !error && typeof data?.[0]?.appointment_id === 'string', error ?? data);

  const { data: list } = await staffA.from('appointments_full').select('id, patient_name, source').eq('id', data[0].appointment_id).single();
  check('staff dashboard view shows the walk-in by name', list?.patient_name === 'Api Walkin' && list?.source === 'walk_in', list);

  const { data: docList } = await doctorA.rpc('get_doctor_today_appointments', { p_doctor_id: DOCTOR_A });
  check('doctor today list includes the walk-in', (docList ?? []).some(r => r.patient_name === 'Api Walkin')
        || today !== new Date().toISOString().slice(0, 10), docList?.map(r => r.patient_name));
}

// ---------------------------------------------------------------------------
// 5. Free plan limit (clinic B): 30 tokens/day, then HTTP 402
// ---------------------------------------------------------------------------
{
  let issued = 0;
  let lastError = null;
  for (let i = 0; i < 40; i += 1) {
    const { error } = await staffB.rpc('issue_token', { p_doctor_id: DOCTOR_B, p_name: `Walk ${i}`, p_phone: null, p_source: 'walk_in' });
    if (error) { lastError = error; break; }
    issued += 1;
  }
  const { data: bToday } = await staffB.from('appointments').select('id, status').eq('center_id', CENTER_B).eq('appointment_date', today);
  const active = (bToday ?? []).filter(r => r.status !== 'cancelled').length;
  check('free plan: stops at 30 tokens for the day', lastError?.code === 'PT402' && active === 30, { issued, active, lastError });

  const res = await fetch(`${URL}/rest/v1/rpc/issue_public_token`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_doctor_id: DOCTOR_B, p_name: 'Late Guest', p_phone: '+923459990000', p_source: 'qr' }),
  });
  check('free plan: public QR join at the limit -> HTTP 402', res.status === 402, res.status);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
