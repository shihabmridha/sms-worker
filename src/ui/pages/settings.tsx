/** GET/POST /settings — the signed-in admin changes their own password. */

import type { Context } from "hono";
import { getDb } from "../../db";
import { updateAdminPassword } from "../../db/queries";
import { hashPassword, verifyPassword } from "../../shared/crypto";
import type { AppEnv } from "../../shared/types";
import { getAdminById } from "../data";
import { redirectFlash, readFlash } from "../flash";
import { Layout } from "../layout";
import { adminPath } from "../paths";
import { formRaw } from "../util";

const MIN_PASSWORD_LENGTH = 8;

export async function settingsGet(c: Context<AppEnv>): Promise<Response> {
  const db = getDb(c.env);
  const adminId = c.get("adminId");
  const admin = await getAdminById(db, adminId);
  const flash = readFlash(c);

  return c.html(
    <Layout title="Settings" active="settings" flash={flash}>
      <h1>Settings</h1>
      <div class="card">
        <p>
          Signed in as <strong>{admin?.username ?? `admin #${adminId}`}</strong>
        </p>
        <h2>Change password</h2>
        <form method="post" action={adminPath("/settings")}>
          <div class="field">
            <label for="current-password">Current password</label>
            <input type="password" id="current-password" name="currentPassword" required />
          </div>
          <div class="field">
            <label for="new-password">New password</label>
            <input
              type="password"
              id="new-password"
              name="newPassword"
              minlength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
          <button type="submit" class="btn btn-primary">
            Update password
          </button>
        </form>
      </div>
    </Layout>,
  );
}

export async function settingsPost(c: Context<AppEnv>): Promise<Response> {
  const adminId = c.get("adminId");
  const body = await c.req.parseBody();
  const currentPassword = formRaw(body.currentPassword);
  const newPassword = formRaw(body.newPassword);

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return redirectFlash(
      c,
      adminPath("/settings"),
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      "error",
    );
  }

  const db = getDb(c.env);
  const admin = await getAdminById(db, adminId);
  if (!admin || !(await verifyPassword(currentPassword, admin.passwordHash))) {
    return redirectFlash(c, adminPath("/settings"), "Current password is incorrect.", "error");
  }

  const newHash = await hashPassword(newPassword);
  await updateAdminPassword(db, adminId, newHash);
  return redirectFlash(c, adminPath("/settings"), "Password updated.");
}
