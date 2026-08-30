/**
 * Single shared page shell: sidebar nav, flash-message slot, one inline
 * <style> block. No external assets, no client-side JS beyond the inline
 * confirm() attached to individual destructive-button forms in the pages
 * themselves (this file renders no scripts).
 *
 * The CSS below deliberately avoids & < > ' " — hono/jsx escapes text
 * children by default (including inside <style>), and <style> is an HTML
 * "raw text" element so the browser never decodes those escapes back out.
 */

import type { FC, PropsWithChildren } from "hono/jsx";
import type { Flash } from "./flash";
import { adminPath } from "./paths";

export type NavKey = "dashboard" | "jobs" | "messages" | "apps" | "providers" | "settings";

const NAV_ITEMS: { key: NavKey; label: string; href: string }[] = [
  { key: "dashboard", label: "Dashboard", href: adminPath("/") },
  { key: "jobs", label: "Jobs", href: adminPath("/jobs") },
  { key: "messages", label: "Messages", href: adminPath("/messages") },
  { key: "apps", label: "Apps", href: adminPath("/apps") },
  { key: "providers", label: "Providers", href: adminPath("/providers") },
  { key: "settings", label: "Settings", href: adminPath("/settings") },
];

const CSS = `
:root {
  color-scheme: light;
  --bg: #f5f6f8;
  --panel: #ffffff;
  --border: #e0e2e7;
  --text: #1f2328;
  --muted: #62676f;
  --accent: #2f6fed;
  --accent-dark: #1f4fb8;
  --danger: #d1373f;
  --success-bg: #e6f6ea;
  --success-text: #1a7d34;
  --error-bg: #fbe9e9;
  --error-text: #a3262e;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  line-height: 1.5;
}

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 20px 0;
  display: flex;
  flex-direction: column;
}

.brand {
  font-weight: 700;
  font-size: 16px;
  padding: 0 20px 16px 20px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
}

.nav-list li a {
  display: block;
  padding: 10px 20px;
  color: var(--text);
}

.nav-list li a:hover { background: var(--bg); text-decoration: none; }

.nav-list li a.active {
  color: var(--accent);
  font-weight: 600;
  background: var(--bg);
  border-right: 3px solid var(--accent);
}

.logout-form { padding: 12px 20px 0 20px; border-top: 1px solid var(--border); margin-top: 12px; }

.content {
  flex: 1;
  padding: 28px 32px;
  max-width: 1100px;
}

h1 { font-size: 20px; margin: 0 0 20px 0; }
h2 { font-size: 16px; margin: 28px 0 12px 0; }

.flash {
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 18px;
  font-size: 13px;
}

.flash-success { background: var(--success-bg); color: var(--success-text); }
.flash-error { background: var(--error-bg); color: var(--error-text); }

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 20px;
  margin-bottom: 20px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th, td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

th { color: var(--muted); font-weight: 600; }

tbody tr:hover { background: var(--bg); }

.btn {
  display: inline-block;
  padding: 7px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.btn:hover { background: var(--bg); }

.btn-primary { background: var(--accent); border-color: var(--accent); color: #ffffff; }
.btn-primary:hover { background: var(--accent-dark); }

.btn-danger { background: var(--danger); border-color: var(--danger); color: #ffffff; }
.btn-danger:hover { background: #a8262d; }

.btn-link {
  background: none;
  border: none;
  color: var(--muted);
  padding: 4px 0;
  font-size: 13px;
}

.btn-link:hover { color: var(--accent); text-decoration: underline; }

label {
  display: block;
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--muted);
}

input[type=text], input[type=password], input[type=number], select, textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  background: var(--panel);
  color: var(--text);
}

.field { margin-bottom: 14px; max-width: 420px; }

.inline-field { display: inline-block; margin-right: 16px; }

.row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }

.muted { color: var(--muted); }

.pagination { margin-top: 16px; display: flex; gap: 12px; }

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: var(--bg);
  border: 1px solid var(--border);
}

.badge-active { background: var(--success-bg); color: var(--success-text); border-color: var(--success-bg); }
.badge-inactive { background: var(--error-bg); color: var(--error-text); border-color: var(--error-bg); }

.key-box {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  word-break: break-all;
  font-size: 13px;
  margin: 12px 0;
}

.login-card { max-width: 380px; }

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
`;

interface LayoutProps {
  title: string;
  active?: NavKey;
  flash?: Flash;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({ title, active, flash, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title} - SMS Worker Admin</title>
        <style>{CSS}</style>
      </head>
      <body>
        <div class="layout">
          <nav class="sidebar">
            <div class="brand">SMS Worker Admin</div>
            <ul class="nav-list">
              {NAV_ITEMS.map((item) => (
                <li>
                  <a href={item.href} class={active === item.key ? "active" : undefined}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <form class="logout-form" method="post" action={adminPath("/logout")}>
              <button type="submit" class="btn-link">
                Logout
              </button>
            </form>
          </nav>
          <main class="content">
            {flash ? <div class={`flash flash-${flash.type}`}>{flash.message}</div> : null}
            {children}
          </main>
        </div>
      </body>
    </html>
  );
};
