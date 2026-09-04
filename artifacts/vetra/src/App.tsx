import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

import { Shell } from '@/components/layout/Shell';
import { OrganizationProjectProvider, useOrganizationProject } from '@/contexts/OrganizationProjectContext';
import ThemeSwitcher from '@/components/theme-switcher';

// ─── Lazy-loaded page chunks ──────────────────────────────────────────────────
const LandingPage = lazy(() => import('@/pages/landing/LandingPage'));
const Dashboard = lazy(() => import('@/pages/dashboard/Dashboard'));
const ProjectList = lazy(() => import('@/pages/projects/ProjectList'));
const ProjectDetail = lazy(() => import('@/pages/projects/ProjectDetail'));
const ProjectTimeline = lazy(() => import('@/pages/planning/ProjectTimeline'));
const AIAssistant = lazy(() => import('@/pages/ai/AIAssistant'));
const TaskList = lazy(() => import('@/pages/tasks/TaskList'));
const DocumentList = lazy(() => import('@/pages/documents/DocumentList'));
const ContractList = lazy(() => import('@/pages/contracts/ContractList'));
const DailyReportList = lazy(() => import('@/pages/reports/DailyReportList'));
const MeetingList = lazy(() => import('@/pages/meetings/MeetingList'));
const UserList = lazy(() => import('@/pages/hr/UserList'));
const AttendanceForm = lazy(() => import('@/pages/hr/AttendanceForm'));
const EquipmentList = lazy(() => import('@/pages/equipment/EquipmentList'));
const InventoryList = lazy(() => import('@/pages/inventory/InventoryList'));
const ProcurementList = lazy(() => import('@/pages/procurement/ProcurementList'));
const PlaceholderPage = lazy(() => import('@/pages/placeholders/PlaceholderPage'));
const WorkspacePage = lazy(() => import('@/pages/workspace/Workspace'));
const WorkspaceDashboard = lazy(() => import('@/pages/workspace/Workspace').then(m => ({ default: m.WorkspaceDashboard })));
const CostControl = lazy(() => import('@/pages/cost-control/CostControl'));
const CRM = lazy(() => import('@/pages/crm/CRM'));
const Reports = lazy(() => import('@/pages/reports/Reports'));
const Settings = lazy(() => import('@/pages/settings/Settings'));
const FormsBuilder = lazy(() => import('@/pages/forms/FormsBuilder'));
const OrgProjectSelector = lazy(() => import('@/pages/onboarding/OrgProjectSelector'));
const QualityManagement = lazy(() => import('@/pages/quality/QualityManagement'));
const NotFound = lazy(() => import('@/pages/not-found'));
const SchedulingPage = lazy(() => import('@/pages/scheduling/SchedulingPage'));
const ProgressPage = lazy(() => import('@/pages/progress/ProgressPage'));
const ResourcesPage = lazy(() => import('@/pages/resources/ResourcesPage'));
// ─── Clerk key resolution ────────────────────────────────────────────────────
// Must use publishableKeyFromHost — resolves the correct key for the current
// hostname so the same build works in dev and prod without branching.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// Empty in dev (Clerk hits FAPI directly); auto-set in prod by the platform.
// Do NOT gate on import.meta.env.PROD — the empty dev value is intentional.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

// Clerk passes full paths to routerPush/routerReplace, but wouter prepends
// the base — strip it to avoid doubling the prefix.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

// ─── Clerk appearance ────────────────────────────────────────────────────────
const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#f5920d',
    colorForeground: '#f5f7fa',
    colorMutedForeground: '#8fa3b8',
    colorDanger: '#f45050',
    colorBackground: '#111827',
    colorInput: '#1e2840',
    colorInputForeground: '#f5f7fa',
    colorNeutral: '#253152',
    fontFamily: 'Outfit, sans-serif',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#111827] rounded-xl w-[440px] max-w-full overflow-hidden border border-[#253152]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#f5f7fa] font-semibold',
    headerSubtitle: 'text-[#8fa3b8]',
    socialButtonsBlockButtonText: 'text-[#f5f7fa]',
    formFieldLabel: 'text-[#8fa3b8]',
    footerActionLink: 'text-[#f5920d] hover:text-[#f5920d]',
    footerActionText: 'text-[#8fa3b8]',
    dividerText: 'text-[#8fa3b8]',
    identityPreviewEditButton: 'text-[#f5920d]',
    formFieldSuccessText: 'text-green-400',
    alertText: 'text-[#f5f7fa]',
    logoBox: 'mb-2',
    logoImage: 'h-10 w-auto',
    socialButtonsBlockButton: 'border-[#253152] bg-[#0e121a] hover:bg-[#1e2840] text-[#f5f7fa]',
    formButtonPrimary: 'bg-[#f5920d] hover:bg-[#e07d00] text-white',
    formFieldInput: 'bg-[#0e121a] border-[#253152] text-[#f5f7fa]',
    footerAction: 'border-t border-[#253152]',
    dividerLine: 'bg-[#253152]',
    alert: 'border-[#253152] bg-[#0e121a]',
    otpCodeFieldInput: 'bg-[#0e121a] border-[#253152] text-[#f5f7fa]',
    formFieldRow: 'gap-3',
    main: 'gap-4',
  },
};

// ─── Query client ────────────────────────────────────────────────────────────
const queryClient = new QueryClient();

// ─── Sign-in / Sign-up pages ─────────────────────────────────────────────────
function SignInPage() {
  return (
    <div className="dark flex min-h-[100dvh] flex-col items-center justify-center bg-[#0e121a] px-4 py-12">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="dark flex min-h-[100dvh] flex-col items-center justify-center bg-[#0e121a] px-4 py-12">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        appearance={clerkAppearance}
      />
    </div>
  );
}

// ─── Cache invalidator ────────────────────────────────────────────────────────
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ─── App routes ───────────────────────────────────────────────────────────────
// AppRoutes handles both authenticated and unauthenticated states:
// - signed-in  → full Shell + inner routes
// - signed-out → landing page at "/", redirect to "/" elsewhere
function ContextGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { hasContext } = useOrganizationProject();

  if (!hasContext && location !== '/onboarding') return <Redirect to="/onboarding" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <Show when="signed-in">
        <OrganizationProjectProvider>
          <ContextGuard>
          <Shell>
            <div className="flex justify-start px-4 pt-4"><ThemeSwitcher /></div>
          <ErrorBoundary fallback={(error, reset) => <ErrorPage error={error} onRetry={reset} />}>
          <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" /></div>}><Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/onboarding" component={OrgProjectSelector} />
            <Route path="/projects" component={ProjectList} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/projects/:id/timeline" component={ProjectTimeline} />
            <Route path="/tasks" component={TaskList} />
            <Route path="/documents" component={DocumentList} />
            <Route path="/forms" component={FormsBuilder} />
            <Route path="/quality" component={QualityManagement} />
            <Route path="/contracts" component={ContractList} />
            <Route path="/daily-reports" component={DailyReportList} />
            <Route path="/meetings" component={MeetingList} />
            <Route path="/hr" component={UserList} />
            <Route path="/hr/attendance" component={AttendanceForm} />
            <Route path="/equipment" component={EquipmentList} />
            <Route path="/inventory" component={InventoryList} />
            <Route path="/procurement" component={ProcurementList} />
            <Route path="/workspace"><WorkspacePage /></Route>
            <Route path="/workspace/:role">{(params) => <WorkspaceDashboard role={params.role} />}</Route>
            <Route path="/cost-control"><CostControl /></Route>
            <Route path="/accounting">
              <PlaceholderPage title="Accounting" description="Financial summary and full ledger." />
            </Route>
            <Route path="/crm"><CRM /></Route>
            <Route path="/reports"><Reports /></Route>
            <Route path="/ai-assistant" component={AIAssistant} />
            <Route path="/settings"><Settings /></Route>
            <Route path="/scheduling" component={SchedulingPage} />
            <Route path="/progress" component={ProgressPage} />
            <Route path="/resources" component={ResourcesPage} />
            <Route component={NotFound} />
          </Switch></Suspense>
          </ErrorBoundary>
          </Shell>
          </ContextGuard>
        </OrganizationProjectProvider>
      </Show>

      <Show when="signed-out">
        <Switch>
          <Route path="/" component={LandingPage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
      </Show>
    </>
  );
}

// ─── ClerkProvider with wouter integration ────────────────────────────────────
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: 'Welcome back to VETRA',
            subtitle: 'Sign in to your workspace',
          },
        },
        signUp: {
          start: {
            title: 'Create your VETRA account',
            subtitle: 'Start managing your projects',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            {/* REQUIRED: /*? is the only wouter wildcard that matches both
                the bare sign-in URL and Clerk's OAuth sub-paths like
                /sign-in/sso-callback, /sign-in/factor-one, etc. */}
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/*?" component={AppRoutes} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorPage } from '@/pages/error';
