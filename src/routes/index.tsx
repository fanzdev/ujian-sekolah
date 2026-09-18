import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { RequireRole, RedirectIfAuthed, PageGate } from './guards'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PageLoader } from '@/components/ui/Feedback'

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const SetupWizardPage = lazy(() => import('@/pages/auth/SetupWizardPage'))
const SetupPage = lazy(() => import('@/pages/system/SetupRequiredPage'))
const NotFoundPage = lazy(() => import('@/pages/system/NotFoundPage'))
const UnauthorizedPage = lazy(() => import('@/pages/system/UnauthorizedPage'))

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const StudentsPage = lazy(() => import('@/pages/admin/StudentsPage'))
const TeachersPage = lazy(() => import('@/pages/admin/TeachersPage'))
const AcademicPages = () => import('@/pages/admin/AcademicPages')
const ClassesPage = lazy(() => AcademicPages().then((m) => ({ default: m.ClassesPage })))
const DepartmentsPage = lazy(() => AcademicPages().then((m) => ({ default: m.DepartmentsPage })))
const ImportExportPage = lazy(() => import('@/pages/admin/ImportExportPage'))
const LogPages = () => import('@/pages/admin/LogPages')
const AuditLogsPage = lazy(() => LogPages().then((m) => ({ default: m.AuditLogsPage })))
const ViolationsPage = lazy(() => LogPages().then((m) => ({ default: m.ViolationsPage })))
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage'))
const AdminSchedulePage = lazy(() => import('@/pages/admin/AdminSchedulePage'))

const TeacherDashboard = lazy(() => import('@/pages/teacher/TeacherDashboard'))
const GradingQueuePage = lazy(() => import('@/pages/teacher/GradingQueuePage'))
const TeacherSchedulePage = lazy(() => import('@/pages/teacher/TeacherSchedulePage'))

const StudentDashboard = lazy(() => import('@/pages/student/StudentDashboard'))
const AvailableExamsPage = lazy(() => import('@/pages/student/AvailableExamsPage'))
const ExamDetailPage = lazy(() => import('@/pages/student/ExamDetailPage'))
const HistoryPage = lazy(() => import('@/pages/student/HistoryPage'))
const ExamCardPage = lazy(() => import('@/pages/student/ExamCardPage'))
const StudentSchedulePage = lazy(() => import('@/pages/student/StudentSchedulePage'))

const ProfilePage = lazy(() => import('@/pages/shared/ProfilePage'))

const QuestionBanksPage = lazy(() => import('@/pages/shared/QuestionBanksPage'))
const BankQuestionsPage = lazy(() => import('@/pages/shared/BankQuestionsPage'))
const ExamListPage = lazy(() => import('@/pages/shared/ExamListPage'))
const ExamEditorPage = lazy(() => import('@/pages/shared/ExamEditorPage'))
const ResultsPage = lazy(() => import('@/pages/shared/ResultsPage'))
const ReportsPage = lazy(() => import('@/pages/shared/ReportsPage'))
const RankingPage = lazy(() => import('@/pages/shared/RankingPage'))
const MonitoringPage = lazy(() => import('@/pages/shared/MonitoringPage'))
const VeyraAiPage = lazy(() => import('@/pages/shared/VeyraAiPage'))

const ExamRunnerPage = lazy(() => import('@/pages/exam/ExamRunnerPage'))

function S({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function RoleHome() {
  const { profile, loading } = useAuth()
  if (loading) return <PageLoader />
  return <Navigate to={profile ? `/${profile.role}` : '/login'} replace />
}

export function AppRoutes() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/env-required" element={<S><SetupPage /></S>} />
        <Route path="/setup" element={<S><SetupWizardPage /></S>} />
        <Route path="/login" element={<RedirectIfAuthed><S><LoginPage /></S></RedirectIfAuthed>} />
        <Route path="/" element={<PageGate><RoleHome /></PageGate>} />
        <Route path="/unauthorized" element={<S><UnauthorizedPage /></S>} />

        {/* Full-screen exam runner (student only) */}
        <Route element={<RequireRole role="student" />}>
          <Route path="/exam/:attemptId" element={<S><ExamRunnerPage /></S>} />
        </Route>

        {/* Student area */}
        <Route element={<RequireRole role="student"><DashboardLayout /></RequireRole>}>
          <Route path="/student" element={<S><StudentDashboard /></S>} />
          <Route path="/student/exams" element={<S><AvailableExamsPage /></S>} />
          <Route path="/student/exams/:examId" element={<S><ExamDetailPage /></S>} />
          <Route path="/student/schedule" element={<S><StudentSchedulePage /></S>} />
          <Route path="/student/history" element={<S><HistoryPage /></S>} />
          <Route path="/student/card" element={<S><ExamCardPage /></S>} />
          <Route path="/student/profile" element={<S><ProfilePage /></S>} />
          <Route path="/student/security" element={<S><ProfilePage tab="security" /></S>} />
        </Route>

        {/* Teacher area */}
        <Route element={<RequireRole role="teacher"><DashboardLayout /></RequireRole>}>
          <Route path="/teacher" element={<S><TeacherDashboard /></S>} />
          <Route path="/teacher/question-banks" element={<S><QuestionBanksPage /></S>} />
          <Route path="/teacher/question-banks/:bankId" element={<S><BankQuestionsPage /></S>} />
          <Route path="/teacher/questions" element={<S><BankQuestionsPage mode="all" /></S>} />
          <Route path="/teacher/exams" element={<S><ExamListPage /></S>} />
          <Route path="/teacher/exams/new" element={<S><ExamEditorPage /></S>} />
          <Route path="/teacher/exams/:examId/edit" element={<S><ExamEditorPage /></S>} />
          <Route path="/teacher/exams/:examId/participants" element={<S><MonitoringPage /></S>} />
          <Route path="/teacher/schedule" element={<S><TeacherSchedulePage /></S>} />
          <Route path="/teacher/results" element={<S><ResultsPage /></S>} />
          <Route path="/teacher/ranking" element={<S><RankingPage /></S>} />
          <Route path="/teacher/grading" element={<S><GradingQueuePage /></S>} />
          <Route path="/teacher/reports" element={<S><ReportsPage /></S>} />
          <Route path="/teacher/veyra-ai" element={<S><VeyraAiPage /></S>} />
          <Route path="/teacher/profile" element={<S><ProfilePage /></S>} />
          <Route path="/teacher/security" element={<S><ProfilePage tab="security" /></S>} />
        </Route>

        {/* Admin area */}
        <Route element={<RequireRole role="admin"><DashboardLayout /></RequireRole>}>
          <Route path="/admin" element={<S><AdminDashboard /></S>} />
          <Route path="/admin/students" element={<S><StudentsPage /></S>} />
          <Route path="/admin/teachers" element={<S><TeachersPage /></S>} />
<Route path="/admin/classes" element={<S><ClassesPage /></S>} />
            <Route path="/admin/departments" element={<S><DepartmentsPage /></S>} />
          <Route path="/admin/question-banks" element={<S><QuestionBanksPage /></S>} />
          <Route path="/admin/question-banks/:bankId" element={<S><BankQuestionsPage /></S>} />
          <Route path="/admin/questions" element={<S><BankQuestionsPage mode="all" /></S>} />
          <Route path="/admin/exams" element={<S><ExamListPage /></S>} />
          <Route path="/admin/exams/new" element={<S><ExamEditorPage /></S>} />
          <Route path="/admin/exams/:examId/edit" element={<S><ExamEditorPage /></S>} />
          <Route path="/admin/exams/:examId/participants" element={<S><MonitoringPage /></S>} />
          <Route path="/admin/schedule" element={<S><AdminSchedulePage /></S>} />
          <Route path="/admin/results" element={<S><ResultsPage /></S>} />
          <Route path="/admin/ranking" element={<S><RankingPage /></S>} />
          <Route path="/admin/reports" element={<S><ReportsPage /></S>} />
          <Route path="/admin/import-export" element={<S><ImportExportPage /></S>} />
          <Route path="/admin/audit-logs" element={<S><AuditLogsPage /></S>} />
          <Route path="/admin/violation-logs" element={<S><ViolationsPage /></S>} />
          <Route path="/admin/settings" element={<S><SettingsPage /></S>} />
          <Route path="/admin/veyra-ai" element={<S><VeyraAiPage /></S>} />
          <Route path="/admin/profile" element={<S><ProfilePage /></S>} />
          <Route path="/admin/security" element={<S><ProfilePage tab="security" /></S>} />
        </Route>

        <Route element={<PageGate><DashboardLayout /></PageGate>}>
          <Route path="*" element={<S><NotFoundPage /></S>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
