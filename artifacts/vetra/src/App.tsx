import { useEffect, useRef } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

import { Shell } from '@/components/layout/Shell';
import LandingPage from '@/pages/landing/LandingPage';
import Dashboard from '@/pages/dashboard/Dashboard';
import ProjectList from '@/pages/projects/ProjectList';
import ProjectDetail from '@/pages/projects/ProjectDetail';
import ProjectTimeline from '@/pages/planning/ProjectTimeline';
import AIAssistant from '@/pages/ai/AIAssistant';
import TaskList from '@/pages/tasks/TaskList';
import DocumentList from '@/pages/documents/DocumentList';
import ContractList from '@/pages/contracts/ContractList';
import DailyReportList from '@/pages/reports/DailyReportList';
import MeetingList from '@/pages/meetings/MeetingList';
import UserList from '@/pages/hr/UserList';
import EquipmentList from '@/pages/equipment/EquipmentList';
import InventoryList from '@/pages/inventory/InventoryList';
import ProcurementList from '@/pages/procurement/ProcurementList';
import PlaceholderPage from '@/pages/placeholders/PlaceholderPage';
import WorkspaceSelector, { WorkspaceDashboard } from '@/pages/workspace/Workspace';
import CostControl from '@/pages/cost-control/CostControl';
import CRM from '@/pages/crm/CRM';
import Reports from '@/pages/reports/Reports';
import Settings from '@/pages/settings/Settings';
import NotFound from '@/pages/not-found';

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
function AppRoutes() {
  return (
    <>
      <Show when="signed-in">
        <Shell>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/projects" component={ProjectList} />
            <Route path="/projects/:id" component={ProjectDetail} />
            <Route path="/projects/:id/timeline" component={ProjectTimeline} />
            <Route path="/tasks" component={TaskList} />
            <Route path="/documents" component={DocumentList} />
            <Route path="/contracts" component={ContractList} />
            <Route path="/daily-reports" component={DailyReportList} />
            <Route path="/meetings" component={MeetingList} />
            <Route path="/hr" component={UserList} />
            <Route path="/equipment" component={EquipmentList} />
            <Route path="/inventory" component={InventoryList} />
            <Route path="/procurement" component={ProcurementList} />
            <Route path="/workspace"><WorkspaceSelector /></Route>
            <Route path="/workspace/:role">{(params) => <WorkspaceDashboard role={params.role} />}</Route>
            <Route path="/cost-control"><CostControl /></Route>
            <Route path="/accounting">
              <PlaceholderPage title="Accounting" description="Financial summary and full ledger." />
            </Route>
            <Route path="/crm"><CRM /></Route>
            <Route path="/reports"><Reports /></Route>
            <Route path="/ai-assistant" component={AIAssistant} />
            <Route path="/settings"><Settings /></Route>
            <Route component={NotFound} />
          </Switch>
        </Shell>
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
