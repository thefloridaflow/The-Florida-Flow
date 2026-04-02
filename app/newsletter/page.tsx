import EmailCapture from '@/components/EmailCapture'
import NewsletterArchive from '@/components/NewsletterArchive'

export const metadata = {
  title: 'Newsletter — The Florida Flow',
  description: 'Daily South Florida ocean conditions, dive reports, and what\'s worth getting in the water for — delivered before 6 AM. Free.',
}

export default function NewsletterPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-3xl mx-auto px-4 py-16 space-y-12">

        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-white tracking-tight">The Florida Flow</h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
            Daily ocean conditions, dive reports, and what&apos;s worth getting in the water for —
            delivered before 6 AM. Space Coast to the Keys. Free.
          </p>
          <p className="text-slate-600 text-xs">~100 divers and ocean lovers. No spam, ever.</p>
        </div>

        <EmailCapture variant="hero" />

        <div className="border-t border-slate-800 pt-10">
          <NewsletterArchive />
        </div>

        <div className="text-center">
          <a href="/" className="text-cyan-600 hover:text-cyan-400 text-sm transition-colors">
            ← Live conditions dashboard
          </a>
        </div>

      </div>
    </div>
  )
}
