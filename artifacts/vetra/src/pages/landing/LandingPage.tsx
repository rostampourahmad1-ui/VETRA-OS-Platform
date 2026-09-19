import { Link } from 'wouter';
import {
  Building2, BarChart3, Shield, FileText, Users, Wrench,
  ArrowLeft, CheckCircle2,
} from 'lucide-react';
import { t } from '@/lib/i18n';

const features = [
  { icon: Building2, titleKey: 'landing.feature1Title', descKey: 'landing.feature1Desc' },
  { icon: BarChart3, titleKey: 'landing.feature2Title', descKey: 'landing.feature2Desc' },
  { icon: FileText, titleKey: 'landing.feature3Title', descKey: 'landing.feature3Desc' },
  { icon: Users, titleKey: 'landing.feature4Title', descKey: 'landing.feature4Desc' },
  { icon: Wrench, titleKey: 'landing.feature5Title', descKey: 'landing.feature5Desc' },
  { icon: Shield, titleKey: 'landing.feature6Title', descKey: 'landing.feature6Desc' },
] as const;

const benefitKeys = [
  'landing.benefit1',
  'landing.benefit2',
  'landing.benefit3',
  'landing.benefit4',
  'landing.benefit5',
  'landing.benefit6',
] as const;

export default function LandingPage() {
  return (
    <div className="dark min-h-screen bg-[#0e121a] text-[#f5f7fa] flex flex-col">
      {/* Nav */}
      <header className="border-b border-[#1e2840] px-6 h-16 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-[#f5920d] flex items-center justify-center text-white font-bold text-sm">
            V
          </div>
          <span dir="ltr" className="font-semibold text-lg tracking-tight text-white">{t('landing.brand')}</span>
          <span className="text-xs font-mono text-[#8fa3b8] border border-[#253152] rounded px-1.5 py-0.5">
            {t('landing.brandSuffix')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm text-[#8fa3b8] hover:text-white transition-colors px-4 py-2"
          >
            {t('landing.navSignIn')}
          </Link>
          <Link
            href="/sign-up"
            className="text-sm font-medium bg-[#f5920d] hover:bg-[#e07d00] text-white rounded-md px-4 py-2 transition-colors"
          >
            {t('landing.navGetStarted')}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-[#1e2840] rounded-full px-4 py-1.5 text-xs font-mono text-[#f5920d] mb-8 border border-[#253152]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f5920d] animate-pulse" />
            {t('landing.badge')}
          </div>

          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-6 leading-tight">
            {t('landing.heroLine1')}
            <br />
            <span className="text-[#f5920d]">{t('landing.heroLine2')}</span>
          </h1>

          <p className="text-lg text-[#8fa3b8] max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('landing.heroDesc')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-[#f5920d] hover:bg-[#e07d00] text-white font-semibold rounded-md px-6 py-3 transition-colors"
            >
              {t('landing.startFree')}
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center gap-2 border border-[#253152] hover:border-[#f5920d] text-[#8fa3b8] hover:text-white font-medium rounded-md px-6 py-3 transition-colors"
            >
              {t('landing.signInToWorkspace')}
            </Link>
          </div>
        </section>

        {/* Features grid */}
        <section className="max-w-7xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f) => (
              <div
                key={f.titleKey}
                className="bg-[#111827] border border-[#1e2840] rounded-xl p-6 hover:border-[#253152] transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-[#1e2840] flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5 text-[#f5920d]" />
                </div>
                <h3 className="font-semibold text-white mb-2">{t(f.titleKey)}</h3>
                <p className="text-sm text-[#8fa3b8] leading-relaxed">{t(f.descKey)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits strip */}
        <section className="border-t border-[#1e2840] py-16 px-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-center text-sm font-mono text-[#8fa3b8] uppercase tracking-widest mb-10">
              {t('landing.benefitsTitle')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {benefitKeys.map((b) => (
                <div key={b} className="flex items-center gap-3 text-sm text-[#8fa3b8]">
                  <CheckCircle2 className="h-4 w-4 text-[#f5920d] flex-shrink-0" />
                  {t(b)}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-6 py-20 text-center">
          <div className="bg-[#111827] border border-[#1e2840] rounded-2xl p-12">
            <h2 className="text-3xl font-bold text-white mb-4">{t('landing.ctaTitle')}</h2>
            <p className="text-[#8fa3b8] mb-8 max-w-lg mx-auto">
              {t('landing.ctaDesc')}
            </p>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-[#f5920d] hover:bg-[#e07d00] text-white font-semibold rounded-md px-8 py-3 transition-colors"
            >
              {t('landing.ctaButton')}
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1e2840] px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[#8fa3b8]">
            <div className="h-5 w-5 rounded bg-[#f5920d] flex items-center justify-center text-white font-bold text-xs">V</div>
            <span dir="ltr">{t('landing.brand')}</span>
          </div>
          <p className="text-xs text-[#8fa3b8] font-mono">
            {t('landing.footerTagline')} <span dir="ltr">© {new Date().getFullYear()}</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
