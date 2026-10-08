# Deploy ProShop to Vercel

Vercel builds this Django project and runs database migrations plus static-file collection during each Production and Preview build. `DATABASE_URL` is supported for hosted PostgreSQL; ensure the correct database URL is available to each Vercel environment before deploying.

## 1. Put the project in GitHub

Choose **Add New → Project** in Vercel. You can import a Git repository or use Vercel's **Choose a folder to deploy** upload for this project. The `.vercelignore` file excludes `.env`, `.env.local`, `db.sqlite3`, and generated static files from the upload. Leave the framework preset and build settings on **Automatic**.

## 2. Create PostgreSQL

Create a PostgreSQL database with a provider that allows connections from Vercel. In Vercel, add the database's full PostgreSQL connection string as `DATABASE_URL` for **Production, Preview, and Development** as needed. When using the Vercel Neon integration, the project-scoped `PROSHOP_DB_DATABASE_URL` is preferred over a generic `DATABASE_URL` on Vercel so another linked database cannot silently take precedence. Confirm that this variable points to the intended ProShop database. Use a connection string with TLS; production settings require `sslmode=require` (the app enforces TLS for `DATABASE_URL`). Do not use the local SQLite file for deployed data.

## 3. Add environment variables

In **Project → Settings → Environment Variables**, add these values. Mark secrets as sensitive/private when Vercel offers that option.

| Variable | Value |
| --- | --- |
| `DJANGO_SECRET_KEY` | A new random secret, at least 50 characters; do not reuse the local development key. |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_SSL_REDIRECT` | `false` |
| `DJANGO_TRUST_PROXY` | `true` |
| `DJANGO_SITE_URL` | The public HTTPS URL for the live shop, such as `https://your-project.vercel.app`. |
| `DJANGO_ALLOWED_HOSTS` | The hostname only, such as `your-project.vercel.app` (no `https://`). Add your custom domain too if you use one. |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | Full HTTPS origins separated by commas, such as `https://your-project.vercel.app,https://shop.example.com`. |
| `DATABASE_URL` | The PostgreSQL connection string from your database provider. |
| `EMAIL_HOST` | Your SMTP server hostname. |
| `EMAIL_PORT` | Usually `587` for TLS or `465` for SSL. |
| `EMAIL_HOST_USER` | SMTP account username. |
| `EMAIL_HOST_PASSWORD` | SMTP app password or provider credential. |
| `EMAIL_USE_TLS` | `true` for port 587; otherwise `false`. |
| `EMAIL_USE_SSL` | `true` for port 465; otherwise `false`. |
| `DEFAULT_FROM_EMAIL` | Verified sender address, for example `ProShop <orders@example.com>`. |
| `RAZORPAY_KEY_ID` | Razorpay test key to begin with. |
| `RAZORPAY_KEY_SECRET` | Matching Razorpay test secret. |

Vercel's `VERCEL_URL` values are automatically allowed for Django host and CSRF checks. Keep `DJANGO_ALLOWED_HOSTS` and trusted origins limited to your own production/custom domains where possible.

Vercel terminates public HTTPS at its edge. Keep Django's own HTTPS redirect disabled on Vercel to avoid redirect loops between the edge and the serverless function; `DJANGO_DEBUG=false` still keeps session and CSRF cookies secure, and production HSTS remains enabled.

## 4. Allow public production traffic

The storefront and customer account APIs are public. Disable Vercel Deployment Protection for the production deployment/domain, or limit protection to preview deployments. Vercel protection intercepts page and API requests before Django sees them, so customer sign-in and the Django admin cannot work behind the Vercel sign-in page. The admin remains protected by Django staff authentication.

Set `DJANGO_SITE_URL` to the public production URL. Django includes that URL's hostname in `ALLOWED_HOSTS`; add any other production or custom hostnames to `DJANGO_ALLOWED_HOSTS`.

After deployment, verify that `/api/health/` returns JSON `{"status":"ok"}`, `/api/auth/status/` returns JSON with `"authenticated": false` when signed out, and `/admin/login/` displays Django's admin login. A Vercel sign-in page or HTML response from an API path means Deployment Protection is still intercepting the request.

Email verification links use Django's default three-day token lifetime. Links also become invalid if the account database or `DJANGO_SECRET_KEY` changes; open the account page again and use **Send a new link** for an unverified account.

## 5. Deploy and initialize each database

Deploy after setting the correct private database URL for each intended environment (Production and, separately, Preview). The Vercel build runs migrations and collects static files:

```powershell
python manage.py migrate --noinput
python manage.py collectstatic --noinput
```

Migrations create any missing authentication tables (including Django Axes' lockout table) without deleting existing users, orders, or products. Do not point Preview at Production unless that is intentional. Run `python manage.py import_catalog` once for each environment that needs its catalog populated; the importer preserves current stock quantities for existing products. Create a Django staff account separately with `python manage.py createsuperuser` using the matching environment's private database settings; do not commit database URLs or secrets. The `VERCEL=1` runtime marker is read before local dotenv files, so `.env.local` cannot accidentally switch a local management command to Vercel's database-selection behavior.

Open the Vercel URL and check `/api/health/`, `/admin/`, and `/admin-dashboard/`. Test email verification and Razorpay using test credentials before switching to live payment keys. Keep SMTP and payment secrets only in Vercel's environment variable settings.
