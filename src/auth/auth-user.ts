import type { UserRole } from '../generated/prisma/client.js';

/** User yang sedang login, dimuat ulang dari database di setiap request */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
}

/** Request yang sudah melewati JwtAuthGuard */
export interface AuthenticatedRequest {
  user: AuthUser;
  /** ID sesi login (family refresh token) dari klaim `sid` access token */
  sessionId: string;
}
