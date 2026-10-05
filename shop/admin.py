from django.contrib import admin

from .models import Order, OrderItem, Product


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("title", "brand", "department", "price", "in_stock")
    list_filter = ("department", "in_stock")
    search_fields = ("title", "brand", "id")


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("product_id_snapshot", "title_snapshot", "unit_price", "quantity")
    can_delete = False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("reference", "user", "status", "total", "created_at")
    list_filter = ("status", "created_at")
    search_fields = ("reference", "user__email")
    readonly_fields = ("reference", "user", "recipient_name", "address", "city", "region", "postal_code", "subtotal", "discount", "promo_code", "gift_packaging", "gift_wrap_cost", "tax", "total", "created_at")
    inlines = (OrderItemInline,)
