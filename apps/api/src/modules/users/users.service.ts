import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool.js';

export interface UserListItem {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  roles: string[];
}

export async function listUsers(outletId: string): Promise<UserListItem[]> {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.full_name, u.email, u.phone, u.is_active,
            COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     WHERE u.home_outlet_id = $1
     GROUP BY u.id
     ORDER BY u.username`,
    [outletId],
  );
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    phone: r.phone,
    isActive: r.is_active,
    roles: r.roles,
  }));
}

export async function createUser(params: {
  outletId: string;
  username: string;
  fullName: string;
  password: string;
  roleCodes: string[];
}): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(params.password, 10);
    const userRes = await client.query(
      `INSERT INTO users (home_outlet_id, username, full_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [params.outletId, params.username, params.fullName, passwordHash],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO user_outlet_access (user_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, params.outletId],
    );
    for (const code of params.roleCodes) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2`,
        [userId, code],
      );
    }

    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUserRoles(userId: string, roleCodes: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    for (const code of roleCodes) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = $2`,
        [userId, code],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUserProfile(
  userId: string,
  params: { fullName?: string; email?: string | null; phone?: string | null; isActive?: boolean },
): Promise<void> {
  await pool.query(
    `UPDATE users SET
       full_name = COALESCE($2, full_name),
       email = COALESCE($3, email),
       phone = COALESCE($4, phone),
       is_active = COALESCE($5, is_active)
     WHERE id = $1`,
    [userId, params.fullName ?? null, params.email ?? null, params.phone ?? null, params.isActive ?? null],
  );
}

/** Admin sets a new password directly — no need to know the old one. */
export async function adminResetPassword(userId: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, hash]);
}
