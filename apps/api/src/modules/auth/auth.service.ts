import { pool } from '../../db/pool.js';

export interface LoadedUser {
  id: string;
  username: string;
  fullName: string;
  passwordHash: string;
  isActive: boolean;
  homeOutletId: string;
  outletIds: string[];
  roles: string[];
  permissions: string[];
}

export async function findUserForLogin(username: string): Promise<LoadedUser | null> {
  const { rows } = await pool.query(
    `SELECT id, username, full_name, password_hash, is_active, home_outlet_id
     FROM users
     WHERE username = $1`,
    [username],
  );
  if (rows.length === 0) return null;
  const u = rows[0];

  const { rows: roleRows } = await pool.query(
    `SELECT r.code FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = $1`,
    [u.id],
  );
  const roles = roleRows.map((r) => r.code);

  // Owners operate across every outlet (multi-outlet oversight); everyone
  // else is scoped to their home outlet plus any explicit grants.
  let outletIds: string[];
  if (roles.includes('owner')) {
    const { rows: allOutlets } = await pool.query(`SELECT id FROM outlets WHERE is_active = true`);
    outletIds = allOutlets.map((r) => r.id);
  } else {
    const { rows: outletRows } = await pool.query(
      `SELECT outlet_id FROM user_outlet_access WHERE user_id = $1`,
      [u.id],
    );
    outletIds = Array.from(new Set([u.home_outlet_id, ...outletRows.map((r) => r.outlet_id)]));
  }

  const { rows: permRows } = await pool.query(
    `SELECT DISTINCT p.code FROM permissions p
     JOIN role_permissions rp ON rp.permission_id = p.id
     JOIN user_roles ur ON ur.role_id = rp.role_id
     WHERE ur.user_id = $1`,
    [u.id],
  );
  const permissions = permRows.map((r) => r.code);

  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    passwordHash: u.password_hash,
    isActive: u.is_active,
    homeOutletId: u.home_outlet_id,
    outletIds,
    roles,
    permissions,
  };
}

export async function touchLastLogin(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
}

export async function getPasswordHash(userId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  return rows[0]?.password_hash ?? null;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}
