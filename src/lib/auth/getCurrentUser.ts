export interface CurrentUser {
  id: number
  name: string
}

// Swap-in point for real auth (Auth.js / Clerk) when going multi-user.
// For now returns a hardcoded single user so all queries have a userId to filter on.
export function getCurrentUser(): CurrentUser {
  return { id: 1, name: 'You' }
}
