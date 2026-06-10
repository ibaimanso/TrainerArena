/** Global roles (SPEC §2). A user can hold several. */
export const ROLE_NAMES = ['superadmin', 'admin', 'judge', 'player'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];
