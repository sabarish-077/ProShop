import uuid

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.SlugField(max_length=120, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=240)),
                ("brand", models.CharField(db_index=True, max_length=120)),
                ("department", models.CharField(db_index=True, max_length=120)),
                ("category", models.CharField(blank=True, max_length=120)),
                ("price", models.DecimalField(decimal_places=2, max_digits=12, validators=[django.core.validators.MinValueValidator(0)])),
                ("original_price", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("image", models.URLField(blank=True, max_length=1000)),
                ("description", models.TextField(blank=True)),
                ("in_stock", models.BooleanField(default=True)),
                ("catalog_data", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"ordering": ["title"]},
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("reference", models.CharField(editable=False, max_length=20, unique=True)),
                ("status", models.CharField(choices=[("pending", "Pending"), ("confirmed", "Confirmed"), ("cancelled", "Cancelled")], db_index=True, default="pending", max_length=16)),
                ("recipient_name", models.CharField(max_length=150)),
                ("address", models.CharField(max_length=300)),
                ("city", models.CharField(max_length=120)),
                ("region", models.CharField(max_length=120)),
                ("postal_code", models.CharField(max_length=24)),
                ("subtotal", models.DecimalField(decimal_places=2, max_digits=12)),
                ("discount", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("tax", models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, max_digits=12)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="shop_orders", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="OrderItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_id_snapshot", models.CharField(max_length=120)),
                ("title_snapshot", models.CharField(max_length=240)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=12)),
                ("quantity", models.PositiveIntegerField(validators=[django.core.validators.MinValueValidator(1)])),
                ("protection_plan_cost", models.DecimalField(decimal_places=2, default=0, max_digits=10)),
                ("order", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="shop.order")),
                ("product", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to="shop.product")),
            ],
        ),
    ]
