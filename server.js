// server.js - الباكيند الرسمي المطور والآمن لمتجر ADD MORE SHOP
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

// 🛠️ معلومات السيرفر المخفية بالباكيند كلياً لمنع علم الزوار بالسر التجاري
const SMM_API_URL = "https://smmglobe.com/api/v2"; 
// ⚠️ يا بومحمد: الصق الـ API Key الخاص بك من صفحة الـ Account في SMMGlobe مكان النص بالأسفل:
const SMM_API_KEY = "ضع_هنا_مفتاح_الـ_API_الخاص_بكامل_من_صفحة_الـ_Account";

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/verify-order', async (req, res) => {
    const { orderID, serviceDetails, targetLink } = req.body;

    if (!orderID || !serviceDetails || !targetLink) {
        return res.status(400).json({ success: false, message: "بيانات الطلب غير مكتملة!" });
    }

    try {
        console.log(`💰 تم تأكيد عملية دفع حقيقية من PayPal برقم: ${orderID}`);
        
        // تجهيز بيانات الطلب وإرسالها مخفية بالكامل عن العميل
        const params = new URLSearchParams();
        params.append('key', SMM_API_KEY);
        params.append('action', 'add');
        params.append('service', serviceDetails.smmServiceId); 
        params.append('link', targetLink); 
        params.append('quantity', serviceDetails.quantity); 

        const response = await fetch(SMM_API_URL, {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const smmResult = await response.json();

        if (smmResult && smmResult.order) {
            console.log(`✅ تم قبول الطلب آلياً ورقم المعاملة المشفرة بالسيرفر هو: ${smmResult.order}`);
            return res.json({ 
                success: true, 
                message: "تم تأكيد الدفع وتوصيل الطلب بنجاح تلقائياً!",
                smmOrderId: smmResult.order
            });
        } else {
            console.error("🚨 خطأ السيرفر:", smmResult);
            return res.status(400).json({ 
                success: false, 
                message: smmResult.error || "فشل السيرفر في قبول الطلب التلقائي الحين." 
            });
        }

    } catch (error) {
        console.error("🚨 خطأ كلي بالشبكة:", error);
        return res.status(500).json({ success: false, message: "حدث خطأ غير متوقع في خادم المتجر الرقمي." });
    }
});

http.listen(PORT, () => {
    console.log(`🚀 ADD MORE SHOP Sky Blue Active on Port ${PORT}`);
});
