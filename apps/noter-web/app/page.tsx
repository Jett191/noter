import {
  Navbar,
  HeroSection,
  ProblemSection,
  FeaturesSection,
  WorkflowSection,
  PreviewSection,
  AIToolsSection,
  CTASection,
  Footer
} from '@/components/landing'

export default function HomePage() {
  return (
    <main className='min-h-screen bg-white font-[family-name:var(--font-sans)]'>
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <FeaturesSection />
      <WorkflowSection />
      <PreviewSection />
      <AIToolsSection />
      <CTASection />
      <Footer />
    </main>
  )
}
