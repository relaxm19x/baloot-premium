// server.js - الباكيند الرسمي لمتجر ADD MORE SHOP المربوط بـ SMMGlobe
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// 🛠️ البيانات الحقيقية المستخرجة من صفحة SMMGlobe الخاصة بك
const SMM_API_URL = "https://smmglobe.com/api/v2"; 
// ⚠️ يا بومحمد: ادخل صفحة Account في SMMGlobe وانسخ الـ API Key الخاص بك وضعه مكان النص في الأسفل
const SMM_API_KEY = "ضع_هنا_مفتاح_الـ_API_الخاص_بكامل_من_صفحة_الـ_Account";

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 💰 استقبال تأكيد PayPal وتمرير الطلب آلياً إلى SMMGlobe لايف الحين
app.post('/api/verify-order', async (req, res) => {
    const { orderID, serviceDetails, targetLink } = req.body;

    if (!orderID || !serviceDetails || !targetLink) {
        return res.status(400).json({ success: false, message: "بيانات الطلب غير مكتملة!" });
    }

    try {
        console.log(`💰 تم تأكيد عملية دفع حقيقية من PayPal برقم: ${orderID}`);
        console.log(`🚀 جاري إرسال الطلب الآلي فوراً إلى SMMGlobe للحساب: ${targetLink}`);

        // إنشاء البيانات بصيغة Form Data متطابقة 100% مع شروط لوحة SMMGlobe
        const params = new URLSearchParams();
        params.append('key', SMM_API_KEY);
        params.append('action', 'add');
        params.append('service', serviceDetails.smmServiceId); 
        params.append('link', targetLink); 
        params.append('quantity', serviceDetails.quantity); 

        // إرسال الطلب عبر طريقة POST المطلوبة بالسيرفر
        const response = await fetch(SMM_API_URL, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const smmResult = await response.json();
        console.log("🔹 استجابة سيرفر SMMGlobe لايف:", smmResult);

        // التحقق من نجاح الطلب وحصوله على رقم Order ID من SMMGlobe
        if (smmResult && smmResult.order) {
            console.log(`✅ تم تنفيذ الطلب بنجاح في السيرفر ورقم الطلب هو: ${smmResult.order}`);
            return res.json({ 
                success: true, 
                message: "تم تأكيد الدفع وتمرير طلبك بنجاح تلقائياً!",
                smmOrderId: smmResult.order
            });
        } else {
            console.error("🚨 خطأ راجع من السيرفر:", smmResult);
            return res.status(400).json({ 
                success: false, 
                message: smmResult.error || "فشل السيرفر في قبول الطلب، يرجى مراجعة الرصيد أو مفتاح الـ API." 
            });
        }

    } catch (error) {
        console.error("🚨 خطأ برمجية كلي أثناء تمرير المعاملة:", error);
        return res.status(500).json({ success: false, message: "حدث خطأ غير متوقع في خادم المتجر الرقمي." });
    }
});

http.listen(PORT, () => {
    console.log(`🚀 ADD MORE SHOP Engine Connected to SMMGlobe on Port ${PORT}`);
});
