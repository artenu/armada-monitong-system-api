import type { UserRole } from '../generated/prisma/client.js';

/** User yang sedang login, dimuat ulang dari database di setiap request */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
}
