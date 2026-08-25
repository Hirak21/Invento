export type UserRole = 'owner' | 'staff'

export interface User {
  id: string
  username: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
}
