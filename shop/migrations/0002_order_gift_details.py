from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("shop", "0001_initial")]
    operations = [
        migrations.AddField(
            model_name="order",
            name="promo_code",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="order",
            name="gift_packaging",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="order",
            name="gift_wrap_cost",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
