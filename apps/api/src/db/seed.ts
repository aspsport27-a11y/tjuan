import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { pool } from './pool.js';
import { PERMISSIONS, DEFAULT_ROLES } from './permissions.js';

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Outlet -----------------------------------------------------------
    // DO NOTHING, not DO UPDATE: seed is re-run on every deploy to register
    // new permission codes, and it must never clobber an outlet the user has
    // since renamed in Admin (it did exactly that once).
    const outletRes = await client.query<{ id: string }>(
      `WITH ins AS (
         INSERT INTO outlets (code, name) VALUES ($1, $2)
         ON CONFLICT (code) DO NOTHING
         RETURNING id
       )
       SELECT id FROM ins
       UNION ALL
       SELECT id FROM outlets WHERE code = $1
       LIMIT 1`,
      [env.SEED_OUTLET_CODE, env.SEED_OUTLET_NAME],
    );
    const outletId = outletRes.rows[0].id;
    console.log(`outlet ready: ${env.SEED_OUTLET_CODE} (${outletId})`);

    // --- Permissions --------------------------------------------------------
    for (const p of PERMISSIONS) {
      await client.query(
        `INSERT INTO permissions (code, module, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET module = EXCLUDED.module, description = EXCLUDED.description`,
        [p.code, p.module, p.description],
      );
    }
    console.log(`permissions seeded: ${PERMISSIONS.length}`);

    // --- Roles + role_permissions ------------------------------------------
    const roleIds: Record<string, string> = {};
    for (const [code, def] of Object.entries(DEFAULT_ROLES)) {
      const roleRes = await client.query<{ id: string }>(
        `INSERT INTO roles (code, name, description, is_system)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
         RETURNING id`,
        [code, def.name, def.description],
      );
      const roleId = roleRes.rows[0].id;
      roleIds[code] = roleId;

      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      for (const permCode of def.permissions) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           SELECT $1, id FROM permissions WHERE code = $2
           ON CONFLICT DO NOTHING`,
          [roleId, permCode],
        );
      }
    }
    console.log(`roles seeded: ${Object.keys(DEFAULT_ROLES).join(', ')}`);

    // --- Admin user ----------------------------------------------------------
    const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 10);
    // Same reasoning as the outlet above: never overwrite an existing admin's
    // details (full_name, and definitely not their password) on re-seed.
    const userRes = await client.query<{ id: string }>(
      `WITH ins AS (
         INSERT INTO users (home_outlet_id, username, full_name, password_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (username) DO NOTHING
         RETURNING id
       )
       SELECT id FROM ins
       UNION ALL
       SELECT id FROM users WHERE username = $2
       LIMIT 1`,
      [outletId, env.SEED_ADMIN_USERNAME, env.SEED_ADMIN_FULL_NAME, passwordHash],
    );
    const userId = userRes.rows[0].id;

    await client.query(
      `INSERT INTO user_outlet_access (user_id, outlet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, outletId],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, roleIds.owner],
    );

    // --- A few default dining tables so the POS has something to show -----
    for (let i = 1; i <= 8; i++) {
      await client.query(
        `INSERT INTO dining_tables (outlet_id, name, capacity, sort_order)
         VALUES ($1, $2, 4, $3)
         ON CONFLICT (outlet_id, name) DO NOTHING`,
        [outletId, `Meja ${i}`, i],
      );
    }

    await client.query('COMMIT');
    console.log(`admin user ready: ${env.SEED_ADMIN_USERNAME} (role: owner)`);
    console.log('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
