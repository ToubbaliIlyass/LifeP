import { createEdge, createNode, getNodes } from '@/lib/graph/queries'

/**
 * The first project: Acture set up by doing, not by reading.
 *
 * What someone sees on a new account is not an empty app but one project
 * whose to-dos are the things worth trying first, each saying where to find
 * it. Ticking them off is learning the app. The first few are for today so
 * the Now card has something real to offer; the rest wait in the project.
 *
 * Written once: the Project carries `starter: true`, so running setup again
 * (or skipping it twice) never adds a second copy. It is an ordinary project
 * after that: rename it, reorder it, delete it.
 *
 * Prayer times are deliberately not here. They stay out of the app until
 * someone turns them on in Settings.
 */
const STEPS: { name: string; notes: string; today: boolean }[] = [
  { name: 'Tell Tuck what’s on your plate', notes: 'Press Tell Tuck and say it, or type it. It turns it into to-dos on the right days.', today: true },
  { name: 'Add a to-do yourself', notes: 'Press N, or the + button. Give it a day if it needs one.', today: true },
  { name: 'Tick this one off', notes: 'Press the circle. That’s how Tuck grows: every finished to-do counts.', today: true },
  { name: 'Make your own project', notes: 'New List, then New project. A project is a goal with steps, like this one.', today: false },
  { name: 'Give something a deadline', notes: 'Open a to-do and set Deadline. It shows on its day and in Upcoming, and stays off Today until you plan it.', today: false },
  { name: 'Tell Tuck your name', notes: 'Settings, then Profile. Tuck will call you that.', today: false },
  { name: 'Pick your colours', notes: 'Settings, then Look and feel. Choose a theme or pick any colour.', today: false },
  { name: 'Turn on reminders', notes: 'Settings, then Notifications. Only when something is due.', today: false },
]

export async function createStarterProject(userId: number, today: string): Promise<boolean> {
  const projects = await getNodes(userId, { type: 'Project' })
  if (projects.some((p) => (p.properties as Record<string, unknown>).starter === true)) return false

  const project = await createNode(userId, 'Project', { name: 'Get set up with Acture', status: 'active', starter: true })
  for (const step of STEPS) {
    const task = await createNode(userId, 'Task', {
      name: step.name,
      status: 'todo',
      priority: 'medium',
      estimatedMinutes: 5,
      notes: step.notes,
      ...(step.today ? { dueDate: today } : {}),
    })
    await createEdge(userId, task.id, project.id, 'part-of')
  }
  return true
}
