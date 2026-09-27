import {
  CheckSquare, FileText, Calendar, HeartPulse, Target,
  Repeat, FolderKanban, BookOpen, GraduationCap, ClipboardList, Clapperboard,
} from 'lucide-react'
import type { QuickType } from '@/lib/quick-add'

/**
 * One glyph per capturable type, shared by the phone sheet and the inline
 * bar on Today so the same thing is never drawn two different ways.
 */
export const TYPE_ICONS: Record<QuickType, React.ComponentType<{ className?: string }>> = {
  Task: CheckSquare,
  Note: FileText,
  Event: Calendar,
  HealthMetric: HeartPulse,
  Goal: Target,
  Habit: Repeat,
  Project: FolderKanban,
  Course: BookOpen,
  Exam: GraduationCap,
  ContentPiece: Clapperboard,
  Assignment: ClipboardList,
}
