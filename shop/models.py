import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


class Product(models.Model):
    id = models.SlugField(primary_key=True, max_length=120)
    title = models.CharField(max_length=240)
    brand = models.CharField(max_length=120, db_index=True)
    department = models.CharField(max_length=120, db_index=True)
    category = models.CharField(max_length=120, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    original_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    image = models.URLField(max_length=1000, blank=True)
    description = models.TextField(blank=True)
    in_stock = models.BooleanField(default=True)
    catalog_data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["title"]

    def __str__(self):
        return self.title

    def as_catalog_dict(self):
        data = dict(self.catalog_data or {})
        data.update({
            "id": self.id,
            "title": self.title,
            "brand": self.brand,
            "department": self.department,
            "category": self.category,
            "price": float(self.price),
            "originalPrice": float(self.original_price) if self.original_price is not None else None,
            "image": self.image,
            "description": self.description,
            "stock": data.get("stock", 1 if self.in_stock else 0),
        })
        return data


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"
        CANCELLED = "cancelled", "Cancelled"

    reference = models.CharField(max_length=20, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="shop_orders")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING, db_index=True)
    razorpay_order_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=64, unique=True, null=True, blank=True)
    recipient_name = models.CharField(max_length=150)
    address = models.CharField(max_length=300)
    city = models.CharField(max_length=120)
    region = models.CharField(max_length=120)
    postal_code = models.CharField(max_length=24)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    promo_code = models.CharField(max_length=20, blank=True, default="")
    gift_packaging = models.BooleanField(default=False)
    gift_wrap_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.reference:
            self.reference = f"PS-{uuid.uuid4().hex[:12].upper()}"
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True)
    product_id_snapshot = models.CharField(max_length=120)
    title_snapshot = models.CharField(max_length=240)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    protection_plan_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return f"{self.title_snapshot} × {self.quantity}"
