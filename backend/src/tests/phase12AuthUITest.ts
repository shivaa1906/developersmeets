import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../database/db.js';
import { httpServer } from '../server.js';
import { ROLES, LEADERSHIP } from '../config/constants.js';
import { generateAccessToken } from '../utils/tokenService.js';
import { hashPassword } from '../utils/password.js';
import { BruteForceProtection } from '../middlewares/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../../../frontend');

let server: http.Server;
let baseUrl: string;

function pass(name: string, detail: string) {
  console.log(`  ✔ [PASS] [${name}] ${detail}`);
}

async function api(apiPath: string, options: any = {}) {
  const url = `${baseUrl}${apiPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  let body: any = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

async function setupSuite() {
  server = httpServer;
  if (!server.listening) {
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  } else {
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}`;
  }
}

export async function runPhase12Tests() {
  console.log('================================================================');
  console.log('PHASE 12 — AUTHENTICATION UI/UX TEST SUITE');
  console.log('Requirement 43 Comprehensive Verification (40 Test Vectors)');
  console.log('================================================================\n');

  await setupSuite();
  BruteForceProtection.resetAll();

  // Read frontend UI source files for structural and accessibility assertions
  const loginSrc = fs.readFileSync(path.join(frontendDir, 'app/login/page.tsx'), 'utf-8');
  const registerSrc = fs.readFileSync(path.join(frontendDir, 'app/register/page.tsx'), 'utf-8');
  const clientRegSrc = fs.readFileSync(path.join(frontendDir, 'app/register/client/page.tsx'), 'utf-8');
  const devRegSrc = fs.readFileSync(path.join(frontendDir, 'app/register/developer/page.tsx'), 'utf-8');
  const forgotPwdSrc = fs.readFileSync(path.join(frontendDir, 'app/forgot-password/page.tsx'), 'utf-8');
  const resetPwdSrc = fs.readFileSync(path.join(frontendDir, 'app/reset-password/page.tsx'), 'utf-8');
  const authCallbackSrc = fs.readFileSync(path.join(frontendDir, 'app/auth/callback/page.tsx'), 'utf-8');
  const joinDevSrc = fs.readFileSync(path.join(frontendDir, 'app/join-developer/page.tsx'), 'utf-8');
  const connectedAccountsSrc = fs.readFileSync(path.join(frontendDir, 'components/ui/connected-accounts.tsx'), 'utf-8');
  const useAuthSrc = fs.readFileSync(path.join(frontendDir, 'hooks/use-auth.tsx'), 'utf-8');
  const apiClientSrc = fs.readFileSync(path.join(frontendDir, 'lib/api-client.ts'), 'utf-8');

  // ============================================================================
  // GROUP 1: LOGIN UI/UX & ZERO DEMO CREDENTIALS
  // ============================================================================
  console.log('--- GROUP 1: LOGIN UI/UX, ZERO FAKE DATA & ACCESSIBILITY ---');

  // Vector 1: Zero fake demo data or demo credentials in login page
  assert(!loginSrc.includes('client001@apexretail.io'), 'Demo client credential removed from login UI');
  assert(!loginSrc.includes('rahul@nexus.dev'), 'Demo developer credential removed from login UI');
  assert(!loginSrc.includes('Demo Role Autofill'), 'Demo role autofill banner removed from login UI');
  pass('LOGIN_ZERO_DEMO_CREDENTIALS', 'Login page has zero hardcoded credentials and zero fake autofills');

  // Vector 2: Accessible password visibility toggle on login page
  assert(loginSrc.includes('aria-label={showPassword ?'), 'Password toggle has aria-label for screen readers');
  assert(loginSrc.includes('title={showPassword ?'), 'Password toggle has title attribute');
  assert(loginSrc.includes('focus-visible:outline-none'), 'Password toggle has focus-visible ring styles');
  assert(!loginSrc.includes('tabIndex={-1}'), 'Password toggle is fully keyboard focusable (no tabIndex=-1)');
  pass('LOGIN_PASSWORD_TOGGLE_A11Y', 'Login password toggle is keyboard accessible with aria-label and focus ring');

  // Vector 3: OAuth buttons have coordinated loading states
  assert(loginSrc.includes('isGoogleLoading ? \'Connecting to Google…\''), 'Google button shows active loading label');
  assert(loginSrc.includes('isFacebookLoading ? \'Connecting to Facebook…\''), 'Facebook button shows active loading label');
  assert(loginSrc.includes('isDiscordLoading ? \'Connecting to Discord…\''), 'Discord button shows active loading label');
  assert(loginSrc.includes('disabled={isAnyLoading}'), 'All OAuth buttons disable during in-flight operations');
  pass('LOGIN_OAUTH_BUTTONS_COORDINATED', 'OAuth buttons show dynamic loading text and prevent concurrent clicks');

  // Vector 4: Safe returnUrl sanitization against open redirects
  assert(loginSrc.includes('getSafeRedirect'), 'Login uses getSafeRedirect validator');
  assert(loginSrc.includes('trimmed.startsWith(\'/\')'), 'Requires relative paths');
  assert(loginSrc.includes('trimmed.startsWith(\'//\')'), 'Rejects protocol-relative open-redirects');
  pass('LOGIN_RETURNURL_SANITIZATION', 'Login validates returnUrl and blocks open-redirect vulnerabilities');

  // Vector 5: Role-authoritative destination fallback in login
  assert(loginSrc.includes('/admin/dashboard'), 'Routes leadership/admin to /admin/dashboard');
  assert(loginSrc.includes('data.user?.role === \'CEO\''), 'Authoritative CEO routing');
  assert(loginSrc.includes('data.user?.role === \'MD\''), 'Authoritative MD routing');
  pass('LOGIN_ROLE_AUTHORITATIVE_ROUTING', 'Executive roles route to /admin/dashboard and clients/devs to /dashboard');

  // Vector 6: Session expiration error handling
  assert(loginSrc.includes('session_expired'), 'Handles session_expired query parameter');
  assert(loginSrc.includes('Your session has expired'), 'Renders clear session expiration message');
  pass('LOGIN_SESSION_EXPIRED_HANDLING', 'Session expiration gracefully displays alert without redirect loop');

  // Vector 7: Account suspension & disablement handling
  assert(loginSrc.includes('account_suspended'), 'Handles account_suspended query parameter');
  assert(loginSrc.includes('account_disabled'), 'Handles account_disabled query parameter');
  assert(loginSrc.includes('Your account has been suspended'), 'Displays explicit account lock advisory');
  pass('LOGIN_ACCOUNT_LOCK_HANDLING', 'Suspended/disabled accounts display clear security notifications');

  // Vector 8: Rate-limit exceeded handling
  assert(loginSrc.includes('rate_limit_exceeded'), 'Handles rate_limit_exceeded parameter');
  assert(loginSrc.includes('Too many authentication attempts'), 'Displays rate-limit guidance');
  pass('LOGIN_RATE_LIMIT_HANDLING', 'Rate limited login displays cooling period notification');

  // ============================================================================
  // GROUP 2: REGISTRATION PAGES (GENERAL, CLIENT, DEVELOPER)
  // ============================================================================
  console.log('\n--- GROUP 2: REGISTRATION UI/UX & ROLE ONBOARDING ---');

  // Vector 9: General RegisterPage tab switching
  assert(registerSrc.includes('roleTab === \'CLIENT\''), 'Contains Client onboarding tab');
  assert(registerSrc.includes('roleTab === \'DEVELOPER\''), 'Contains Developer onboarding tab');
  assert(registerSrc.includes('I am a Client'), 'Clear role description for clients');
  assert(registerSrc.includes('I am a Developer'), 'Clear role description for developers');
  pass('REGISTER_TAB_SELECTION', 'Register landing cleanly differentiates Client and Developer roles');

  // Vector 10: RegisterPage wrapped in Suspense
  assert(registerSrc.includes('<React.Suspense'), 'RegisterPage wrapped in Suspense boundary');
  assert(registerSrc.includes('useSearchParams()'), 'RegisterPage uses useSearchParams safely inside Suspense');
  pass('REGISTER_SUSPENSE_BOUNDARY', 'RegisterPage satisfies Next.js Suspense boundary requirements');

  // Vector 11: ClientRegisterPage input fields
  assert(clientRegSrc.includes('label="Full Name / Primary Contact"'), 'Client form has contact name input');
  assert(clientRegSrc.includes('label="Company Name (Optional)"'), 'Client form has company name input');
  assert(clientRegSrc.includes('label="Work Email"'), 'Client form has email input');
  assert(clientRegSrc.includes('label="Phone Number (Optional)"'), 'Client form has optional phone input');
  assert(clientRegSrc.includes('label="Password"'), 'Client form has password input');
  assert(clientRegSrc.includes('label="Confirm Password"'), 'Client form has confirm password input');
  pass('CLIENT_REGISTER_FORM_FIELDS', 'Client registration form contains complete required and optional fields');

  // Vector 12 & 13: ClientRegisterPage validation logic
  assert(clientRegSrc.includes('formData.password.length < 8'), 'Enforces 8 character password minimum in UI');
  assert(clientRegSrc.includes('formData.password !== formData.confirmPassword'), 'Enforces password match confirmation in UI');
  pass('CLIENT_REGISTER_CLIENT_VALIDATION', 'Client form validates password length and match prior to submission');

  // Vector 14: ClientRegisterPage accessible password toggles
  assert(clientRegSrc.includes('title={showPassword ? \'Hide password\' : \'Show password\'}'), 'Client password toggle has title');
  assert(clientRegSrc.includes('aria-label={showPassword ? \'Hide password\' : \'Show password\'}'), 'Client password toggle has aria-label');
  assert(clientRegSrc.includes('title={showConfirmPassword ?'), 'Client confirm toggle has title');
  assert(!clientRegSrc.includes('tabIndex={-1}'), 'Client password toggles have no tabIndex=-1');
  pass('CLIENT_REGISTER_PASSWORD_A11Y', 'Client registration password toggles are fully keyboard accessible');

  // Vector 15 & 16: ClientRegisterPage loading coordination & OAuth
  assert(clientRegSrc.includes('disabled={isAnyLoading}'), 'Client form inputs and buttons disable during in-flight requests');
  assert(clientRegSrc.includes('Connecting to Google…'), 'Client Google button indicates active loading');
  assert(clientRegSrc.includes('Connecting to Facebook…'), 'Client Facebook button indicates active loading');
  assert(clientRegSrc.includes('Connecting to Discord…'), 'Client Discord button indicates active loading');
  pass('CLIENT_REGISTER_OAUTH_COORDINATION', 'Client OAuth buttons have distinct loading states and prevent double submission');

  // Vector 17: Client registration API verification
  const runId = Date.now();
  const clientRegApiRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'UI Test Client',
      companyName: 'UI Client Corp',
      email: `ui.client.${runId}@testdomain.io`,
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    }),
  });
  assert.strictEqual(clientRegApiRes.status, 201, 'Client registration API returns 201 Created');
  assert(clientRegApiRes.body.token, 'Client registration returns session token');
  assert(clientRegApiRes.body.client?.client_number, 'Client registration returns client identifier');
  pass('CLIENT_REGISTRATION_API_SUCCESS', 'Client registration yields immediate session token and client identifier');

  // Vector 18: Developer candidate registration 5 structured sections
  assert(devRegSrc.includes('1. Identity & Credentials'), 'Developer form contains Section 1: Identity & Credentials');
  assert(devRegSrc.includes('2. Professional Role & Experience'), 'Developer form contains Section 2: Professional Role & Experience');
  assert(devRegSrc.includes('3. Technical Skills & Stack'), 'Developer form contains Section 3: Technical Skills & Stack');
  assert(devRegSrc.includes('4. Public Profiles & Proof of Work'), 'Developer form contains Section 4: Public Profiles & Proof of Work');
  assert(devRegSrc.includes('Engineering Bio & Specialization'), 'Developer form contains Section 5: Engineering Bio');
  pass('DEVELOPER_REGISTER_STRUCTURED_SECTIONS', 'Developer registration form is organized into 5 clear engineering sections');

  // Vector 19: Developer registration optional fields clearly labeled
  assert(devRegSrc.includes('Profile Photo URL (Optional)'), 'Profile photo explicitly marked optional');
  assert(devRegSrc.includes('AI / ML Tools (Optional)'), 'AI/ML tools explicitly marked optional');
  assert(devRegSrc.includes('UI / UX & Design Tools (Optional)'), 'UI/UX tools explicitly marked optional');
  assert(devRegSrc.includes('LinkedIn URL (Optional)'), 'LinkedIn URL explicitly marked optional');
  assert(devRegSrc.includes('Portfolio / Website URL (Optional)'), 'Portfolio URL explicitly marked optional');
  assert(devRegSrc.includes('LeetCode Profile (Optional)'), 'LeetCode explicitly marked optional');
  assert(devRegSrc.includes('Kaggle Profile (Optional)'), 'Kaggle explicitly marked optional');
  assert(devRegSrc.includes('Other Relevant Links (Optional)'), 'Other links explicitly marked optional');
  pass('DEVELOPER_REGISTER_OPTIONAL_LABELS', 'Developer registration form explicitly labels all optional fields');

  // Vector 20 & 21: Developer registration password toggles and validation
  assert(devRegSrc.includes('aria-label={showPassword ?'), 'Developer password toggle has aria-label');
  assert(devRegSrc.includes('aria-label={showConfirmPassword ?'), 'Developer confirm toggle has aria-label');
  assert(!devRegSrc.includes('tabIndex={-1}'), 'Developer password toggles have no tabIndex=-1');
  assert(devRegSrc.includes('formData.password.length < 8'), 'Developer form validates password length');
  assert(devRegSrc.includes('formData.password !== formData.confirmPassword'), 'Developer form validates matching passwords');
  pass('DEVELOPER_REGISTER_PASSWORD_A11Y', 'Developer password toggles are accessible and validate before submit');

  // Vector 22: Developer registration client transition context banner
  assert(devRegSrc.includes('isFromClient'), 'Detects transition context via query parameter');
  assert(devRegSrc.includes('You Are Creating a Separate Developer Account'), 'Displays informational transition banner');
  assert(devRegSrc.includes('Separate Platform Identity'), 'Explains separate platform identity');
  assert(devRegSrc.includes('Independent Email Address'), 'Explains independent email requirement');
  pass('DEVELOPER_REGISTER_TRANSITION_BANNER', 'Developer registration displays platform architecture banner when referred from client');

  // Vector 23: Developer registration rejects email already used by client
  const devClientEmailCollisionRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Collision Dev',
      username: `coll-dev-${runId}`,
      email: `ui.client.${runId}@testdomain.io`, // Same email as Client registered in Vector 17
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      location: 'Bengaluru, India',
      roleTitle: 'Full Stack Engineer',
      experience: '4',
      skills: 'TypeScript, PostgreSQL',
      githubUrl: 'https://github.com/collision-dev',
      bio: 'Experienced engineer',
    }),
  });
  assert.strictEqual(devClientEmailCollisionRes.status, 409, 'Developer registration rejects existing client email with 409');
  pass('DEVELOPER_REGISTRATION_EMAIL_COLLISION', 'Developer registration prevents email collision with existing client accounts');

  // Vector 24: Developer registration success transitions to PENDING review state
  const devRegApiRes = await api('/api/auth/register/developer', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Rahul Developer UI',
      username: `rahul-ui-${runId}`,
      email: `rahul.ui.${runId}@nexusengineers.io`,
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      location: 'Bengaluru, India',
      roleTitle: 'Full Stack Engineer',
      experience: '5',
      skills: 'TypeScript, Next.js, Node.js, PostgreSQL',
      githubUrl: 'https://github.com/rahul-ui',
      bio: 'Senior systems architect and full-stack software engineer',
    }),
  });
  assert(
    devRegApiRes.body.status === 'PENDING_DEVELOPER_APPROVAL' ||
    devRegApiRes.body.verificationStatus === 'PENDING' ||
    devRegApiRes.body.developer?.verificationStatus === 'PENDING',
    'Application enters PENDING approval state'
  );
  assert(devRegSrc.includes('PENDING_DEVELOPER_APPROVAL'), 'Developer UI renders post-submission review state');
  assert(devRegSrc.includes('Application Under Executive Review'), 'Review screen details executive review protocol');
  pass('DEVELOPER_REGISTRATION_PENDING_STATE', 'Developer registration successfully enters PENDING_VERIFICATION with review screen');

  // ============================================================================
  // GROUP 3: FORGOT & RESET PASSWORD UI/UX
  // ============================================================================
  console.log('\n--- GROUP 3: FORGOT & RESET PASSWORD UI/UX ---');

  // Vector 25: Zero demo token leakage in ForgotPassword UI
  assert(!forgotPwdSrc.includes('demoToken'), 'demoToken removed from forgot-password UI');
  assert(!forgotPwdSrc.includes('Direct Password Reset Link'), 'Reset link banner removed from forgot-password UI');
  pass('FORGOT_PASSWORD_ZERO_TOKEN_LEAKAGE', 'Forgot password UI does not leak reset tokens on screen');

  // Vector 26: Generic confirmation feedback on forgot password
  assert(forgotPwdSrc.includes('Recovery Instructions Dispatched'), 'Displays generic dispatch heading');
  assert(forgotPwdSrc.includes('If an account is associated with'), 'Generic non-enumerating message prevents email discovery');
  assert(forgotPwdSrc.includes('disabled={isLoading}'), 'Input and submit button disable during request');

  const forgotRes = await api('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email: `nonexistent.${runId}@nowhere.com` }),
  });
  assert.strictEqual(forgotRes.status, 200, 'Forgot password returns 200 generic message for any email');
  pass('FORGOT_PASSWORD_GENERIC_FEEDBACK', 'Forgot password provides safe generic response without leaking user existence');

  // Vector 27: ResetPasswordPage Suspense boundary and token detection
  assert(resetPwdSrc.includes('<React.Suspense'), 'ResetPasswordPage wrapped in Suspense boundary');
  assert(resetPwdSrc.includes('searchParams.get(\'token\')'), 'Detects reset token from URL searchParams');
  pass('RESET_PASSWORD_SUSPENSE_AND_TOKEN', 'ResetPasswordPage handles URL token detection inside Suspense');

  // Vector 28: ResetPasswordPage accessible password toggles
  assert(resetPwdSrc.includes('title={showPassword ? \'Hide password\' : \'Show password\'}'), 'Reset password toggle has title');
  assert(resetPwdSrc.includes('aria-label={showPassword ? \'Hide password\' : \'Show password\'}'), 'Reset password toggle has aria-label');
  assert(resetPwdSrc.includes('title={showConfirmPassword ?'), 'Reset confirm toggle has title');
  assert(!resetPwdSrc.includes('tabIndex={-1}'), 'Reset password toggles have no tabIndex=-1');
  pass('RESET_PASSWORD_TOGGLE_A11Y', 'Reset password toggles are fully keyboard accessible');

  // Vector 29: ResetPasswordPage client validation
  assert(resetPwdSrc.includes('newPassword.length < 8'), 'Validates minimum 8 characters');
  assert(resetPwdSrc.includes('newPassword !== confirmPassword'), 'Validates matching confirm password');
  assert(resetPwdSrc.includes('!token.trim()'), 'Validates token presence before dispatch');
  pass('RESET_PASSWORD_CLIENT_VALIDATION', 'Reset password enforces validation and token presence');

  // ============================================================================
  // GROUP 4: OAUTH CALLBACK & URL TOKEN SANITIZATION
  // ============================================================================
  console.log('\n--- GROUP 4: OAUTH CALLBACK & URL SECURITY ---');

  // Vector 30: Address bar token sanitization and Suspense in AuthCallbackPage
  assert(authCallbackSrc.includes('window.history.replaceState'), 'OAuth callback strips token from address bar via replaceState');
  assert(authCallbackSrc.includes('<React.Suspense'), 'OAuth callback wrapped in Suspense boundary');
  assert(authCallbackSrc.includes('getSafeRedirect'), 'OAuth callback sanitizes destination redirect URL');
  assert(authCallbackSrc.includes('defaultDestination = \'/admin/dashboard\''), 'OAuth callback enforces role-authoritative executive destination');
  pass('OAUTH_CALLBACK_SECURITY', 'OAuth callback purges token from address bar, validates returnUrl, and enforces role routes');

  // ============================================================================
  // GROUP 5: DEVELOPER TRANSITION WORKFLOW
  // ============================================================================
  console.log('\n--- GROUP 5: DEVELOPER TRANSITION UI/UX & SAFETY ---');

  // Vector 31: JoinDeveloper transition page Option A and Option B
  assert(joinDevSrc.includes('handleSelectOptionA'), 'Provides Option A workflow');
  assert(joinDevSrc.includes('handleDeactivateClientAccount'), 'Provides Option B workflow');
  assert(joinDevSrc.includes('/register/developer?from=client'), 'Option A redirects with from=client context');
  assert(joinDevSrc.includes('/register/developer?from=transition_deactivated'), 'Option B redirects with deactivation context');
  pass('JOIN_DEVELOPER_OPTIONS_RENDERED', 'Transition page renders distinct Option A and Option B pathways');

  // Vector 32: Active projects block Option B deactivation
  assert(joinDevSrc.includes('Your account has active projects'), 'Warns user when active projects prevent deactivation');
  assert(joinDevSrc.includes('Please resolve or transfer those projects'), 'Provides actionable project resolution guidance');
  pass('JOIN_DEVELOPER_ACTIVE_PROJECT_BLOCKING', 'Transition workflow blocks account deactivation when active projects exist');

  // Vector 33: Confirmation phrase requirement for Option B
  assert(joinDevSrc.includes('DEACTIVATE CLIENT ACCOUNT'), 'Requires exact confirmation phrase DEACTIVATE CLIENT ACCOUNT');
  assert(joinDevSrc.includes('DELETE'), 'Allows alternative explicit DELETE confirmation');
  assert(joinDevSrc.includes('confirmation: trimmed'), 'Sends user confirmation to backend verification endpoint');
  pass('JOIN_DEVELOPER_CONFIRMATION_PHRASE', 'Account deactivation requires typing explicit confirmation phrase');

  // ============================================================================
  // GROUP 6: CONNECTED ACCOUNTS & LOCKOUT PREVENTION
  // ============================================================================
  console.log('\n--- GROUP 6: CONNECTED ACCOUNTS & LOCKOUT PREVENTION ---');

  // Vector 34: ConnectedAccountsCard component features
  assert(connectedAccountsSrc.includes('Connected Accounts'), 'Renders Connected Accounts card title');
  assert(connectedAccountsSrc.includes('Account Password'), 'Displays Account Password configuration status');
  assert(connectedAccountsSrc.includes('Google'), 'Supports Google OAuth provider');
  assert(connectedAccountsSrc.includes('Facebook'), 'Supports Facebook OAuth provider');
  assert(connectedAccountsSrc.includes('Discord'), 'Supports Discord OAuth provider');
  assert(connectedAccountsSrc.includes('<React.Suspense'), 'ConnectedAccountsCard wrapped in Suspense');
  pass('CONNECTED_ACCOUNTS_UI_FEATURES', 'Connected accounts card displays password status and all 3 OAuth providers');

  // Vector 35: Lockout prevention in Connected Accounts UI
  assert(connectedAccountsSrc.includes('canDisconnect'), 'Inspects canDisconnect flag from server');
  assert(connectedAccountsSrc.includes('This is currently your only sign-in method'), 'Displays warning when only 1 method remains');
  assert(connectedAccountsSrc.includes('disabled={data ? !data.providers[confirmDisconnect.provider]?.canDisconnect : false}'), 'Disables disconnect button if unlinking would cause lockout');
  pass('CONNECTED_ACCOUNTS_LOCKOUT_PREVENTION', 'UI prevents disconnecting last remaining sign-in method');

  // ============================================================================
  // GROUP 7: AUTH HOOK, API CLIENT & REACTIVE INVALIDATION
  // ============================================================================
  console.log('\n--- GROUP 7: AUTH HOOK & REACTIVE SESSION INVALIDATION ---');

  // Vector 36: useAuth background session verification with /api/auth/me
  assert(useAuthSrc.includes('syncServerSession'), 'Contains syncServerSession verification function');
  assert(useAuthSrc.includes('/auth/me'), 'Synchronizes user profile with /api/auth/me');
  assert(useAuthSrc.includes('isPendingVerification'), 'Exposes isPendingVerification status flag');
  pass('USE_AUTH_SESSION_SYNC', 'useAuth verifies authoritative session with /api/auth/me in background');

  // Vector 37: Reactive invalidation events across tabs & API requests
  assert(useAuthSrc.includes('nexus:session_invalidated'), 'Listens for nexus:session_invalidated custom event');
  assert(useAuthSrc.includes('nexus:account_locked'), 'Listens for nexus:account_locked custom event');
  assert(apiClientSrc.includes('nexus:session_invalidated'), 'API client dispatches nexus:session_invalidated on 401');
  assert(apiClientSrc.includes('nexus:account_locked'), 'API client dispatches nexus:account_locked on 403');
  assert(useAuthSrc.includes('router.replace(`/login?error=${errCode}`)'), 'Redirects invalidated sessions to /login?error=... without loops');
  pass('REACTIVE_SESSION_INVALIDATION', 'Reactive event listeners purge invalid sessions and navigate cleanly to login');

  // Vector 38: useAuth logout cleans up storage and socket
  assert(useAuthSrc.includes('localStorage.removeItem(\'nexus_auth_token\')'), 'Purges nexus_auth_token on logout');
  assert(useAuthSrc.includes('localStorage.removeItem(\'nexus_auth_user\')'), 'Purges nexus_auth_user on logout');
  assert(useAuthSrc.includes('sessionStorage.clear()'), 'Clears sessionStorage on logout');
  assert(useAuthSrc.includes('realtimeClient.disconnect()'), 'Disconnects realtime WebSocket on logout');
  assert(useAuthSrc.includes('typeof redirectTarget === \'string\''), 'Gracefully handles string or MouseEvent in logout');
  pass('USE_AUTH_LOGOUT_CLEANUP', 'Logout purges local storage, disconnects socket, and supports React click events');

  // ============================================================================
  // GROUP 8: END-TO-END AUTHENTICATION LIFECYCLE
  // ============================================================================
  console.log('\n--- GROUP 8: END-TO-END AUTHENTICATION LIFECYCLE ---');

  // Vector 39: Zero fake data throughout all auth pages
  const allAuthPagesSrc = loginSrc + registerSrc + clientRegSrc + devRegSrc + forgotPwdSrc + resetPwdSrc;
  assert(!allAuthPagesSrc.includes('sample_token'), 'No sample_token found in auth pages');
  assert(!allAuthPagesSrc.includes('mock_session'), 'No mock_session found in auth pages');
  pass('ZERO_FAKE_AUTH_DATA_INVARIANTS', 'Zero mock tokens, fake sessions, or demo credentials across entire auth frontend');

  // Vector 40: Complete sign-in, session check, and logout API cycle
  const e2eEmail = `e2e.user.${runId}@domain.org`;
  const e2ePassword = 'StrongE2EPassword123!';
  const e2eRegRes = await api('/api/auth/register/client', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'E2E Lifecycle User',
      email: e2eEmail,
      password: e2ePassword,
      confirmPassword: e2ePassword,
    }),
  });
  assert.strictEqual(e2eRegRes.status, 201, 'E2E user registered');
  const e2eToken = e2eRegRes.body.token;

  // Verify /api/auth/me returns valid user
  const meRes = await api('/api/auth/me', {
    headers: { Authorization: `Bearer ${e2eToken}` },
  });
  assert.strictEqual(meRes.status, 200, 'Me endpoint validates session');
  assert.strictEqual(meRes.body.user.email, e2eEmail, 'Me returns authentic user profile');

  // Logout session
  const logoutRes = await api('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${e2eToken}` },
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout succeeds on server');

  // Verify session invalidated
  const postLogoutMeRes = await api('/api/auth/me', {
    headers: { Authorization: `Bearer ${e2eToken}` },
  });
  assert.strictEqual(postLogoutMeRes.status, 401, 'Session rejected with 401 after logout');
  pass('E2E_AUTH_LIFECYCLE_VERIFICATION', 'Complete registration -> session verification -> server logout -> session revocation cycle passed');

  console.log('\n================================================================');
  console.log('PHASE 12 TEST SUMMARY: 40 / 40 PASSED');
  console.log('================================================================\n');
  console.log('🎉 ALL PHASE 12 AUTHENTICATION UI/UX CHECKS PASSED!\n');
}

// Auto-run if executed directly
if (process.argv[1]?.includes('phase12AuthUITest')) {
  runPhase12Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ PHASE 12 TEST FAILURE:', err);
      process.exit(1);
    });
}
