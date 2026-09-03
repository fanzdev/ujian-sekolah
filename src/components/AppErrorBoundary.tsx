import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Terjadi kesalahan tak terduga.',
    }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 dark:bg-slate-800 dark:text-slate-200">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-500 dark:bg-amber-600 dark:text-white dark:text-white">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">Terjadi Kesalahan</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Aplikasi mengalami kesalahan yang tidak terduga. Muat ulang halaman untuk mencoba lagi.
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400 break-words dark:bg-slate-800 dark:text-slate-200">
            {this.state.message.slice(0, 200)}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            <RotateCcw className="h-4 w-4" /> Muat Ulang
          </button>
        </div>
      </div>
    )
  }
}
