# ProShop

ProShop is a Django shop with a SQL catalog and order database, account sign-in, and a lightweight storefront.

## Run locally

1. Use Python 3.10 or newer.
2. Install dependencies: `python -m pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set a private `DJANGO_SECRET_KEY`. Local verification emails print in the terminal. Add Razorpay test API keys from your Dashboard to try test checkout.
4. Create the local SQLite database and admin tables: `python manage.py migrate`.
5. Import the product list: `python manage.py import_catalog`.
6. Create an admin account if needed: `python manage.py createsuperuser`.
7. Start the local site: `python manage.py runserver`.

Open `http://127.0.0.1:8000/`. The staff-only store dashboard is at `/admin-dashboard/`; the full management console is at `/admin/`. Create a staff account with `python manage.py createsuperuser`. The database health endpoint is `/api/health/`.

## Database

SQLite is the default for local development. For production, use PostgreSQL by setting `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_HOST`. Set `POSTGRES_SSLMODE=require` when the database provider supports TLS. Run migrations and the catalog import against the production database before serving traffic.

## Production

For Vercel setup, database, and environment variable instructions, see [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md).

- Set `DJANGO_DEBUG=false`, a unique long `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, and `DJANGO_CSRF_TRUSTED_ORIGINS`.
- Serve behind HTTPS. When TLS ends at a trusted reverse proxy such as Vercel, set `DJANGO_TRUST_PROXY=true` and leave `DJANGO_SSL_REDIRECT=false`; the proxy handles public HTTPS while Django keeps secure cookies and HSTS enabled.
- Run `python manage.py migrate`, `python manage.py import_catalog`, and `python manage.py collectstatic --noinput` during release. Vercel migrations and static collection run automatically from `vercel.json`; import the catalog separately when a new database needs initial data.
- Start with `gunicorn proshop_site.wsgi:application` on Linux or another production WSGI server.
- Back up the database and keep credentials in the host's secret store. Do not commit `.env` or the SQLite database.

## Security and current checkout behavior

Django session authentication, CSRF checks, email verification, password validation, and login lockout are enabled. Orders require a signed-in, email-verified account. The server checks product prices, available stock, approved discount codes, and totals before creating a payment order, and each account can only see its own orders. Razorpay handles payment details; ProShop does not collect or store card data. The backend verifies Razorpay's signature and checks the captured payment status, amount, and currency before confirming an order.

For deployment, set `DJANGO_SITE_URL`, SMTP settings (`EMAIL_HOST`, credentials, and `DEFAULT_FROM_EMAIL`), and Razorpay key ID/secret as private environment variables. Use Razorpay test credentials until the full payment flow has been verified, enable automatic payment capture in Razorpay, and switch to live keys only after approval to accept real payments. A payment flow needs an end-to-end test with your Razorpay account before it is ready for live sales. Tax is currently estimated at 8.25% to match the existing storefront. Update `TAX_RATE` in `shop/api.py` and the displayed rate in `js/cart.js` and `cart.html` to match the tax rules where you sell before accepting real orders.
