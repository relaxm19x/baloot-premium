// server.js - الباكيند المحدث لمتجر ADD MORE SHOP المربوط بـ SMMGlobe
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const path = require('path');
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;

const SMM_API_URL = "https://smmglobe.com/api/v2"; 
// ⚠️ ضع مفتاح الـ API الخاص بك من صفحة Account في SMMGlobe مكان النص بالأسفل:
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
        console.log(`💰 تم تأكيد معاملة دفع عبر PayPal برقم: ${orderID}`);
        
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
            return res.json({ 
                success: true, 
                message: "تم تمرير الطلب التلقائي بنجاح الحين!",
                smmOrderId: smmResult.order
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: smmResult.error || "فشل السيرفر في قبول المعاملة التلقائية." 
            });
        }

    } catch (error) {
        return res.status(500).json({ success: false, message: "حدث خطأ في معالجة طلب الأتمتة." });
    }
});

http.listen(PORT, () => {
    console.log(`🚀 ADD MORE SHOP Active with Full Platforms on Port ${PORT}`);
});
